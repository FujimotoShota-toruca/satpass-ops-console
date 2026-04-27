import React, { useEffect, useMemo, useState } from "react";
import * as satellite from "satellite.js";
import * as yaml from "js-yaml";
import JSZip from "jszip";

const EARTH_RADIUS_KM = 6378.137;
const SUN_RADIUS_KM = 695700;
const AU_KM = 149597870.7;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const C_MPS = 299_792_458;
const EARTH_OMEGA_RAD_S = 7.2921150e-5;

const DEFAULT_MAP_URL = "https://commons.wikimedia.org/wiki/Special:Redirect/file/Equirectangular-projection.jpg?width=2048";
const DEFAULT_MAP_ATTRIBUTION = "Wikimedia Commons: Equirectangular-projection.jpg / NASA imagery derivative";
const GITHUB_REPOSITORY_URL = "https://github.com/FujimotoShota-toruca/satpass-ops-console";
const CONFIG_STORAGE_KEYS = [
  "web-orbitron:config-yaml-v14",
  "web-orbitron:config-yaml-v13",
  "web-orbitron:config-yaml-v12",
  "web-orbitron:config-yaml-v11",
  "web-orbitron:config-yaml-v10",
  "web-orbitron:config-yaml-v9",
  "web-orbitron:config-yaml-v8",
  "web-orbitron:config-yaml-v7",
  "web-orbitron:config-yaml-v6",
];


const DEFAULT_TLE_SOURCES_TEXT = `# name@url 形式で1行1件を指定します。http://celestrak.org はブラウザ混在コンテンツ対策として https に補正します。
ISS (ZARYA)@https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE`;


const DEFAULT_RAW_CONFIG = {
  input_root: "./",
  output_root: "../output",
  observation_date: "2026-04-25",
  folder_name: "test_ops",
  timezone: "Asia/Tokyo",
  uplink_base_frequency_hz: 2036250000,
  downlink_base_frequency_hz: 2201000000,
  min_elevation_deg: 0.0,
  ground_station: {
    name: "Utsunomiya GS",
    latitude_deg: 36.5551,
    longitude_deg: 139.8828,
    altitude_m: 120.0,
  },
  tle: `ISS (ZARYA)\n1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990\n2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000`,
  app: {
    title: "SatPass Ops Console",
    refresh_sec: 1,
    prediction_horizon_hours: 12,
    prediction_step_sec: 30,
    track_minutes_before: 45,
    track_minutes_after: 90,
    track_step_sec: 60,
  },
  map: {
    projection: "equirectangular",
    background_image_url: DEFAULT_MAP_URL,
    background_opacity: 0.78,
    attribution: DEFAULT_MAP_ATTRIBUTION,
    show_synthetic_land: false,
    show_grid: true,
  },
  radar: {
    background_image_url: "",
    background_opacity: 0.45,
    attribution: "",
  },
  orbit_track: {
    color_mode: "sunlight",
    sunlit_color: "#22c55e",
    penumbra_color: "#f59e0b",
    umbra_color: "#7c3aed",
    default_color: "satellite",
    show_eclipse_label: true,
  },
};

const SAT_COLORS = ["#22c55e", "#38bdf8", "#f59e0b", "#e879f9", "#fb7185", "#a3e635", "#818cf8"];

const RECOMMENDED_MAPS = [
  { id: "wikimedia-equirectangular-satellite", label: "Wikimedia satellite equirectangular", projection: "equirectangular", url: DEFAULT_MAP_URL, opacity: 0.78, attribution: DEFAULT_MAP_ATTRIBUTION },
  { id: "wikimedia-mercator-satellite", label: "Wikimedia satellite Mercator", projection: "mercator", url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Mercator-projection.jpg?width=2048", opacity: 0.78, attribution: "Wikimedia Commons: Mercator-projection.jpg / NASA Blue Marble derivative" },
  { id: "wikimedia-location-equirectangular", label: "Wikimedia light equirectangular", projection: "equirectangular", url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/World_location_map_(equirectangular_180).svg", opacity: 0.86, attribution: "Wikimedia Commons: World location map (equirectangular 180).svg" },
  { id: "bundled-dark-mercator", label: "Bundled dark Mercator", projection: "mercator", url: "./assets/world_mercator_simple.svg", opacity: 0.92, attribution: "Bundled simplified Mercator-style SVG" },
];


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeLon(lonDeg) {
  let x = Number(lonDeg);
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseTleBlock(tleText) {
  const lines = safeString(tleText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const line1Index = lines.findIndex((line) => line.startsWith("1 "));
  const line2Index = lines.findIndex((line) => line.startsWith("2 "));
  if (line1Index < 0 || line2Index < 0) {
    throw new Error("TLE の 1 行目または 2 行目が見つかりません。`1 ...` と `2 ...` の2行が必要です。");
  }
  const name = line1Index > 0 ? lines[line1Index - 1] : "UNKNOWN_SAT";
  return {
    name,
    line1: lines[line1Index],
    line2: lines[line2Index],
  };
}

function tleBlockFromSatellite(sat) {
  const name = sat?.name || "UNKNOWN_SAT";
  return `${name}\n${sat?.line1 || ""}\n${sat?.line2 || ""}`;
}

function normalizeApp(rawApp = {}) {
  const rawTitle = safeString(rawApp.title, "SatPass Ops Console");
  const title = rawTitle === "Web Orbitron MVP" ? "SatPass Ops Console" : rawTitle;
  return {
    title,
    refreshSec: safeNumber(rawApp.refreshSec ?? rawApp.refresh_sec, 1),
    predictionHorizonHours: safeNumber(rawApp.predictionHorizonHours ?? rawApp.prediction_horizon_hours, 12),
    predictionStepSec: safeNumber(rawApp.predictionStepSec ?? rawApp.prediction_step_sec, 30),
    trackMinutesBefore: safeNumber(rawApp.trackMinutesBefore ?? rawApp.track_minutes_before, 45),
    trackMinutesAfter: safeNumber(rawApp.trackMinutesAfter ?? rawApp.track_minutes_after, 90),
    trackStepSec: safeNumber(rawApp.trackStepSec ?? rawApp.track_step_sec, 60),
  };
}

function normalizeOps(raw = {}) {
  return {
    inputRoot: safeString(raw.input_root ?? raw.inputRoot, "./"),
    outputRoot: safeString(raw.output_root ?? raw.outputRoot, "../output"),
    observationDate: safeString(raw.observation_date ?? raw.observationDate, "2026-04-25"),
    folderName: safeString(raw.folder_name ?? raw.folderName, "test_ops"),
    timezone: safeString(raw.timezone, "Asia/Tokyo"),
    uplinkBaseFrequencyHz: safeNumber(raw.uplink_base_frequency_hz ?? raw.uplinkBaseFrequencyHz, 2036250000),
    downlinkBaseFrequencyHz: safeNumber(raw.downlink_base_frequency_hz ?? raw.downlinkBaseFrequencyHz, 2201000000),
    minElevationDeg: safeNumber(raw.min_elevation_deg ?? raw.minElevationDeg, 0),
    commandElevationDeg: safeNumber(
      raw.command_elevation_deg ?? raw.commandElevationDeg ?? raw.command_aos_los_elevation_deg ?? raw.commandAosLosElevationDeg,
      safeNumber(raw.min_elevation_deg ?? raw.minElevationDeg, 0)
    ),
  };
}

function normalizeMap(rawMap = {}) {
  const projection = safeString(rawMap.projection, "equirectangular").toLowerCase();
  return {
    projection: projection === "mercator" ? "mercator" : "equirectangular",
    backgroundImageUrl: safeString(rawMap.background_image_url ?? rawMap.backgroundImageUrl, DEFAULT_MAP_URL),
    backgroundOpacity: clamp(safeNumber(rawMap.background_opacity ?? rawMap.backgroundOpacity, 0.78), 0, 1),
    attribution: safeString(rawMap.attribution ?? rawMap.map_attribution ?? rawMap.background_attribution, DEFAULT_MAP_ATTRIBUTION),
    showSyntheticLand: rawMap.show_synthetic_land ?? rawMap.showSyntheticLand ?? false,
    showGrid: rawMap.show_grid ?? rawMap.showGrid ?? true,
  };
}

function normalizeRadar(rawRadar = {}) {
  return {
    backgroundImageUrl: safeString(rawRadar.background_image_url ?? rawRadar.backgroundImageUrl, ""),
    backgroundOpacity: clamp(safeNumber(rawRadar.background_opacity ?? rawRadar.backgroundOpacity, 0.45), 0, 1),
    attribution: safeString(rawRadar.attribution ?? rawRadar.background_attribution, ""),
  };
}

function normalizeOrbitTrack(rawOrbit = {}) {
  const colorMode = safeString(rawOrbit.color_mode ?? rawOrbit.colorMode, "sunlight").toLowerCase();
  return {
    colorMode: colorMode === "satellite" ? "satellite" : "sunlight",
    sunlitColor: safeString(rawOrbit.sunlit_color ?? rawOrbit.sunlitColor, "#22c55e"),
    penumbraColor: safeString(rawOrbit.penumbra_color ?? rawOrbit.penumbraColor, "#f59e0b"),
    umbraColor: safeString(rawOrbit.umbra_color ?? rawOrbit.umbraColor, "#7c3aed"),
    defaultColor: safeString(rawOrbit.default_color ?? rawOrbit.defaultColor, "satellite"),
    showEclipseLabel: rawOrbit.show_eclipse_label ?? rawOrbit.showEclipseLabel ?? true,
  };
}

function normalizeSatellite(raw, index = 0) {
  if (typeof raw?.tle === "string") {
    const parsed = parseTleBlock(raw.tle);
    return {
      id: safeString(raw.id, `sat-${index + 1}`),
      name: safeString(raw.name, parsed.name),
      line1: parsed.line1,
      line2: parsed.line2,
      color: raw.color || SAT_COLORS[index % SAT_COLORS.length],
    };
  }

  const line1 = raw?.line1 ?? raw?.tle?.line1 ?? raw?.tle?.[0] ?? "";
  const line2 = raw?.line2 ?? raw?.tle?.line2 ?? raw?.tle?.[1] ?? "";
  return {
    id: safeString(raw?.id, `sat-${index + 1}`),
    name: safeString(raw?.name, `Satellite ${index + 1}`),
    line1: safeString(line1).trim(),
    line2: safeString(line2).trim(),
    color: raw?.color || SAT_COLORS[index % SAT_COLORS.length],
  };
}

function parseAngleDeg(value, fallback = 0, axis = "lat") {
  if (Number.isFinite(Number(value)) && value !== null && value !== "") return Number(value);

  const hemisphereSign = (hemisphere) => {
    const h = safeString(hemisphere).trim().toUpperCase();
    if (h === "S" || h === "W") return -1;
    if (h === "N" || h === "E") return 1;
    return null;
  };

  if (Array.isArray(value)) {
    const [deg, min = 0, sec = 0, hemi = ""] = value;
    const d = Number(deg);
    const m = Number(min);
    const ss = Number(sec);
    if (!Number.isFinite(d)) return fallback;
    const inferred = hemisphereSign(hemi);
    const sign = inferred ?? (d < 0 ? -1 : 1);
    return sign * (Math.abs(d) + (Number.isFinite(m) ? Math.abs(m) / 60 : 0) + (Number.isFinite(ss) ? Math.abs(ss) / 3600 : 0));
  }

  if (value && typeof value === "object") {
    const deg = value.deg ?? value.degrees ?? value.d;
    const min = value.min ?? value.minute ?? value.minutes ?? value.m ?? 0;
    const sec = value.sec ?? value.second ?? value.seconds ?? value.s ?? 0;
    const hemi = value.hemisphere ?? value.hemi ?? value.direction ?? value.dir ?? "";
    const d = Number(deg);
    const mm = Number(min);
    const ss = Number(sec);
    if (!Number.isFinite(d)) return fallback;
    const inferred = hemisphereSign(hemi);
    const sign = inferred ?? (d < 0 ? -1 : 1);
    return sign * (Math.abs(d) + (Number.isFinite(mm) ? Math.abs(mm) / 60 : 0) + (Number.isFinite(ss) ? Math.abs(ss) / 3600 : 0));
  }

  const text = safeString(value).trim();
  if (!text) return fallback;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;

  const upper = text.toUpperCase();
  const trimmedUpper = upper.trim();
  let hemi = "";
  if (/[北]/.test(trimmedUpper)) hemi = "N";
  else if (/[南]/.test(trimmedUpper)) hemi = "S";
  else if (/[東]/.test(trimmedUpper)) hemi = "E";
  else if (/[西]/.test(trimmedUpper)) hemi = "W";
  else if (/^[NSEW]\b/.test(trimmedUpper)) hemi = trimmedUpper[0];
  else if (/\b[NSEW]$/.test(trimmedUpper)) hemi = trimmedUpper[trimmedUpper.length - 1];

  const normalized = upper
    .replace(/[NSEW東西南北]/g, " ")
    .replace(/[°º˚度D]/g, " ")
    .replace(/[′’'分M]/g, " ")
    .replace(/[″”"秒S]/g, " ")
    .replace(/[:，、,]/g, " ");
  const nums = normalized.match(/[+-]?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length || !Number.isFinite(nums[0])) return fallback;

  const d = nums[0];
  const m = Number.isFinite(nums[1]) ? Math.abs(nums[1]) : 0;
  const sec = Number.isFinite(nums[2]) ? Math.abs(nums[2]) : 0;
  const inferred = hemisphereSign(hemi);
  const sign = inferred ?? (d < 0 ? -1 : 1);
  const result = sign * (Math.abs(d) + m / 60 + sec / 3600);

  if (axis === "lat") return clamp(result, -90, 90);
  if (axis === "lon") return normalizeLon(result);
  return result;
}

function normalizeStation(raw = {}, index = 0, fallbackMinElevationDeg = 0) {
  const latRaw = raw.latDeg ?? raw.latitudeDeg ?? raw.latitude_deg ?? raw.lat ?? raw.latitude ?? raw.latitude_dms ?? raw.latitudeDms;
  const lonRaw = raw.lonDeg ?? raw.longitudeDeg ?? raw.longitude_deg ?? raw.lon ?? raw.longitude ?? raw.longitude_dms ?? raw.longitudeDms;
  return {
    id: safeString(raw.id, `gs-${index + 1}`),
    name: safeString(raw.name, `Ground Station ${index + 1}`),
    latDeg: parseAngleDeg(latRaw, 0, "lat"),
    lonDeg: parseAngleDeg(lonRaw, 0, "lon"),
    heightM: safeNumber(raw.heightM ?? raw.altitudeM ?? raw.altitude_m ?? raw.height ?? 0, 0),
    minElevationDeg: safeNumber(raw.minElevationDeg ?? raw.min_elevation_deg ?? raw.minElDeg ?? raw.maskDeg ?? fallbackMinElevationDeg, fallbackMinElevationDeg),
  };
}


function sanitizeId(text, fallback = "item") {
  const base = safeString(text, fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}

function normalizeCelestrakUrl(rawUrl) {
  let value = safeString(rawUrl).trim();
  if (!value) return "";
  value = value.replace(/^http:\/\/(www\.)?celestrak\.org/i, "https://celestrak.org");
  value = value.replace(/^https:\/\/www\.celestrak\.org/i, "https://celestrak.org");

  try {
    const url = new URL(value);
    const isCelestrakGp = /(^|\.)celestrak\.org$/i.test(url.hostname) && url.pathname.toLowerCase().endsWith("/norad/elements/gp.php");
    if (isCelestrakGp && !url.searchParams.has("FORMAT")) url.searchParams.set("FORMAT", "TLE");
    return url.toString();
  } catch {
    return value;
  }
}

function sourceFromNameUrl(name, url, index = 0) {
  const cleanName = safeString(name, `TLE Source ${index + 1}`).trim();
  const cleanUrl = normalizeCelestrakUrl(url);
  if (!cleanUrl) return null;
  return {
    id: sanitizeId(cleanName || cleanUrl, `tle-source-${index + 1}`),
    name: cleanName || `TLE Source ${index + 1}`,
    url: cleanUrl,
  };
}

function sourceFromLine(line, index = 0) {
  const trimmed = safeString(line).trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const match = trimmed.match(/^(.+?)\s*@\s*(https?:\/\/\S+)\s*$/i);
  if (!match) return null;
  return sourceFromNameUrl(match[1].trim(), match[2].trim(), index);
}

function normalizeTleSources(rawSources, rawSatellites = []) {
  const sources = [];

  function pushSource(source) {
    if (!source?.url) return;
    const key = source.url.toLowerCase();
    if (sources.some((item) => item.url.toLowerCase() === key || item.id === source.id)) return;
    sources.push(source);
  }

  if (typeof rawSources === "string") {
    rawSources.split(/\r?\n/).forEach((line, index) => pushSource(sourceFromLine(line, index)));
  } else if (Array.isArray(rawSources)) {
    rawSources.forEach((item, index) => {
      if (typeof item === "string") pushSource(sourceFromLine(item, index));
      else if (item && typeof item === "object") {
        const url = item.url ?? item.tle_url ?? item.tleUpdateUrl ?? item.update_url ?? item.updateUrl;
        const catnr = item.catnr ?? item.cat_nr ?? item.norad_cat_id ?? item.noradCatId ?? item.norad;
        const generatedUrl = url || (catnr ? `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=TLE` : "");
        pushSource(sourceFromNameUrl(item.name ?? item.id ?? item.label ?? `TLE Source ${index + 1}`, generatedUrl, index));
      }
    });
  } else if (rawSources && typeof rawSources === "object") {
    Object.entries(rawSources).forEach(([name, url], index) => pushSource(sourceFromNameUrl(name, url, index)));
  }

  if (Array.isArray(rawSatellites)) {
    rawSatellites.forEach((item, index) => {
      if (!item || typeof item !== "object") return;
      const url = item.tle_url ?? item.update_url ?? item.tleUpdateUrl ?? item.updateUrl;
      const catnr = item.catnr ?? item.cat_nr ?? item.norad_cat_id ?? item.noradCatId ?? item.norad;
      const generatedUrl = url || (catnr ? `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=TLE` : "");
      if (generatedUrl) pushSource(sourceFromNameUrl(item.name ?? item.id ?? `Satellite ${index + 1}`, generatedUrl, index));
    });
  }

  return sources;
}

function hasUserDefinedTle(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (raw.tle || raw.satellite) return true;
  if (Array.isArray(raw.satellites)) return raw.satellites.some((item) => item?.tle || item?.line1 || item?.line2);
  return false;
}

function extractPlainTleSourceText(text) {
  const trimmed = safeString(text).trim();
  if (!trimmed) return null;
  if (!/@\s*https?:\/\//i.test(trimmed)) return null;
  return { tle_sources: trimmed };
}

async function fetchSatelliteFromTleSource(source, index = 0) {
  const response = await fetch(normalizeCelestrakUrl(source.url), { cache: "no-store" });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const text = await response.text();
  if (!/^\s*(?:.+\n)?1\s+/m.test(text) || !/^\s*2\s+/m.test(text)) {
    throw new Error(`${source.name}: TLE 形式の応答ではありません。URLに FORMAT=TLE を付けてください。`);
  }
  const parsed = parseTleBlock(text);
  return {
    id: sanitizeId(source.id || source.name || parsed.name, `sat-${index + 1}`),
    name: source.name || parsed.name,
    line1: parsed.line1,
    line2: parsed.line2,
    color: SAT_COLORS[index % SAT_COLORS.length],
    sourceUrl: normalizeCelestrakUrl(source.url),
    fetchedAt: new Date().toISOString(),
  };
}

function normalizeConfig(rawInput) {
  const raw = rawInput && typeof rawInput === "object" ? rawInput : DEFAULT_RAW_CONFIG;
  const rawSettings = raw.settings || raw.other_settings || raw.ops || {};
  const rawDoppler = raw.doppler || raw.doppler_settings || {};
  const merged = { ...DEFAULT_RAW_CONFIG, ...raw, ...rawSettings, ...rawDoppler };
  const app = normalizeApp(raw.app || raw.application || raw.ui || merged.app || {});
  const ops = normalizeOps(merged);
  const map = normalizeMap(raw.map || raw.map_settings || merged.map || {});
  const radar = normalizeRadar(raw.radar || raw.radar_chart || raw.skyline || merged.radar || {});
  const orbitTrack = normalizeOrbitTrack(raw.orbit_track || raw.orbitTrack || raw.track || merged.orbit_track || {});
  const tleSources = normalizeTleSources(raw.tle_sources ?? raw.tle_update_urls ?? raw.tleUpdateUrls ?? raw.tle_urls ?? raw.tleUrls ?? merged.tle_sources, raw.satellites);

  let satellites = [];
  if (Array.isArray(raw.satellites)) {
    satellites = raw.satellites.map(normalizeSatellite).filter((sat) => sat.line1 && sat.line2);
  } else if (raw.satellite) {
    satellites = [normalizeSatellite(raw.satellite, 0)].filter((sat) => sat.line1 && sat.line2);
  } else if (tleSources.length > 0 && !hasUserDefinedTle(raw)) {
    const parsed = parseTleBlock(DEFAULT_RAW_CONFIG.tle);
    satellites = [{ id: "sat-1", name: parsed.name, line1: parsed.line1, line2: parsed.line2, color: SAT_COLORS[0] }];
  } else {
    try {
      const parsed = parseTleBlock(merged.tle);
      satellites = [
        {
          id: "sat-1",
          name: parsed.name,
          line1: parsed.line1,
          line2: parsed.line2,
          color: SAT_COLORS[0],
        },
      ];
    } catch {
      const parsed = parseTleBlock(DEFAULT_RAW_CONFIG.tle);
      satellites = [{ id: "sat-1", name: parsed.name, line1: parsed.line1, line2: parsed.line2, color: SAT_COLORS[0] }];
    }
  }

  let groundStations = [];
  if (Array.isArray(raw.groundStations)) {
    groundStations = raw.groundStations.map((gs, i) => normalizeStation(gs, i, ops.minElevationDeg));
  } else if (Array.isArray(raw.ground_stations)) {
    groundStations = raw.ground_stations.map((gs, i) => normalizeStation(gs, i, ops.minElevationDeg));
  } else {
    groundStations = [normalizeStation(merged.ground_station, 0, ops.minElevationDeg)];
  }

  return { app, ops, map, radar, orbitTrack, tleSources, satellites, groundStations };
}

function exportableConfig(appConfig, opsConfig, mapConfig, radarConfig, orbitTrackConfig, tleSources, sat, station, allSatellites = null, allStations = null) {
  const exportSatellites = Array.isArray(allSatellites) && allSatellites.length ? allSatellites : (sat ? [sat] : []);
  const exportStations = Array.isArray(allStations) && allStations.length ? allStations : (station ? [station] : []);
  return {
    input_root: opsConfig.inputRoot,
    output_root: opsConfig.outputRoot,
    observation_date: opsConfig.observationDate,
    folder_name: opsConfig.folderName,
    timezone: opsConfig.timezone,
    uplink_base_frequency_hz: opsConfig.uplinkBaseFrequencyHz,
    downlink_base_frequency_hz: opsConfig.downlinkBaseFrequencyHz,
    min_elevation_deg: station?.minElevationDeg ?? opsConfig.minElevationDeg,
    command_elevation_deg: opsConfig.commandElevationDeg,
    ground_station: {
      name: station?.name || "Ground Station",
      latitude_deg: station?.latDeg ?? 0,
      longitude_deg: station?.lonDeg ?? 0,
      altitude_m: station?.heightM ?? 0,
    },
    tle: sat ? tleBlockFromSatellite(sat) : "",
    tle_sources: (Array.isArray(tleSources) ? tleSources : []).map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
    })),
    ground_stations: exportStations.map((gs) => ({
      id: gs.id,
      name: gs.name,
      latitude_deg: gs.latDeg,
      longitude_deg: gs.lonDeg,
      altitude_m: gs.heightM,
      min_elevation_deg: gs.minElevationDeg,
    })),
    satellites: exportSatellites.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      ...(item.sourceUrl ? { tle_url: item.sourceUrl, fetched_at: item.fetchedAt } : {}),
      tle: tleBlockFromSatellite(item),
    })),
    app: {
      title: appConfig.title,
      refresh_sec: appConfig.refreshSec,
      prediction_horizon_hours: appConfig.predictionHorizonHours,
      prediction_step_sec: appConfig.predictionStepSec,
      track_minutes_before: appConfig.trackMinutesBefore,
      track_minutes_after: appConfig.trackMinutesAfter,
      track_step_sec: appConfig.trackStepSec,
    },
    map: {
      projection: mapConfig.projection,
      background_image_url: mapConfig.backgroundImageUrl,
      background_opacity: mapConfig.backgroundOpacity,
      attribution: mapConfig.attribution,
      show_synthetic_land: mapConfig.showSyntheticLand,
      show_grid: mapConfig.showGrid,
    },
    radar: {
      background_image_url: radarConfig.backgroundImageUrl,
      background_opacity: radarConfig.backgroundOpacity,
      attribution: radarConfig.attribution,
    },
    orbit_track: {
      color_mode: orbitTrackConfig.colorMode,
      sunlit_color: orbitTrackConfig.sunlitColor,
      penumbra_color: orbitTrackConfig.penumbraColor,
      umbra_color: orbitTrackConfig.umbraColor,
      default_color: orbitTrackConfig.defaultColor,
      show_eclipse_label: orbitTrackConfig.showEclipseLabel,
    },
  };
}

function dumpYaml(config) {
  return yaml.dump(config, { lineWidth: 140, noRefs: true, quotingType: '"', forceQuotes: false });
}

function buildTemplateYaml() {
  return `# SatPass Ops Console 設定例 v29
# 1ファイル運用も、分割YAML運用も可能です。
# 分割する場合は、ground_stations.yaml / satellites.yaml / doppler.yaml / settings.yaml / map.yaml / radar.yaml / orbit_track.yaml を
# Import YAML(s)/JSON で複数選択してください。

settings:
  input_root: ./
  output_root: ../output
  observation_date: 2026-04-25
  folder_name: test_ops
  timezone: Asia/Tokyo
  min_elevation_deg: 0.0
  # コマンド送信など、運用開始/終了に使う任意仰角 [deg]
  command_elevation_deg: 5.0

# ドップラー設定 [Hz]
doppler:
  uplink_base_frequency_hz: 2036250000
  downlink_base_frequency_hz: 2201000000

# 地上局情報。複数局に対応。
ground_stations:
  - id: utsunomiya
    name: Utsunomiya GS
    latitude_deg: 36.5551
    longitude_deg: 139.8828
    altitude_m: 120.0
    min_elevation_deg: 0.0

# 衛星情報。複数衛星に対応。
# tle: | は 2行TLEでも3行TLEでも可。
# tle_url / update_url / catnr を指定した衛星は、Fetch URL TLEs でCelesTrak等からTLEを取得できます。
satellites:
  - id: iss
    name: ISS (ZARYA)
    color: "#22c55e"
    tle: |
      ISS (ZARYA)
      1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990
      2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000

# TLE取得元。name@url 形式の複数行文字列、配列、または satellites[].tle_url に対応します。
# YAML一発設定でURL取得を使う場合は、下記のコメントを外して対象衛星を追加してください。
# CelesTrak gp.php は FORMAT=TLE を推奨します。
# tle_sources: |
#   ISS (ZARYA)@https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE

# ブラウザ表示設定
app:
  title: SatPass Ops Console
  refresh_sec: 1
  prediction_horizon_hours: 12
  prediction_step_sec: 30
  track_minutes_before: 45
  track_minutes_after: 90
  track_step_sec: 60

# 地図設定
# projection: mercator または equirectangular
# デフォルトは見た目を優先して Wikimedia satellite equirectangular を使用します。
map:
  projection: equirectangular
  background_image_url: "https://commons.wikimedia.org/wiki/Special:Redirect/file/Equirectangular-projection.jpg?width=2048"
  background_opacity: 0.78
  attribution: Wikimedia Commons Equirectangular projection / NASA imagery derivative
  show_synthetic_land: false
  show_grid: true

# レーダーチャート設定
# background_image_url に地上局から見たスカイライン画像を指定できます。
# 方位・仰角グリッドと重ねるため、正方形画像を推奨します。
radar:
  background_image_url: ""
  background_opacity: 0.45
  attribution: ""

# 軌道プロット設定
# color_mode: sunlight にすると軌道上の日照状態で色分けします。
# satellite にすると衛星ごとの色で描画します。
orbit_track:
  color_mode: sunlight
  sunlit_color: "#22c55e"
  penumbra_color: "#f59e0b"
  umbra_color: "#7c3aed"
  default_color: satellite
  show_eclipse_label: true
`;
}
function parseConfigText(text, filename = "") {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("設定ファイルが空です。");
  const plainSources = extractPlainTleSourceText(trimmed);
  if (plainSources && !/^\s*[\w-]+\s*:/m.test(trimmed)) return plainSources;
  if (filename.endsWith(".json") || trimmed.startsWith("{")) return JSON.parse(trimmed);
  return yaml.load(trimmed);
}

function mergeConfigFragments(fragments) {
  const merged = {};
  for (const fragment of fragments) {
    if (!fragment || typeof fragment !== "object") continue;
    if (fragment.settings || fragment.other_settings || fragment.ops) merged.settings = { ...(merged.settings || {}), ...(fragment.settings || fragment.other_settings || fragment.ops) };
    if (fragment.app || fragment.application || fragment.ui) merged.app = { ...(merged.app || {}), ...(fragment.app || fragment.application || fragment.ui) };
    if (fragment.doppler || fragment.doppler_settings) merged.doppler = { ...(merged.doppler || {}), ...(fragment.doppler || fragment.doppler_settings) };
    if (fragment.map || fragment.map_settings) merged.map = { ...(merged.map || {}), ...(fragment.map || fragment.map_settings) };
    if (fragment.radar || fragment.radar_chart || fragment.skyline) merged.radar = { ...(merged.radar || {}), ...(fragment.radar || fragment.radar_chart || fragment.skyline) };
    if (fragment.orbit_track || fragment.orbitTrack || fragment.track) merged.orbit_track = { ...(merged.orbit_track || {}), ...(fragment.orbit_track || fragment.orbitTrack || fragment.track) };
    if (fragment.ground_stations || fragment.groundStations) merged.ground_stations = fragment.ground_stations || fragment.groundStations;
    if (fragment.ground_station) merged.ground_station = fragment.ground_station;
    if (fragment.satellites) merged.satellites = fragment.satellites;
    if (fragment.satellite) merged.satellite = fragment.satellite;
    if (fragment.tle_sources || fragment.tle_update_urls || fragment.tleUpdateUrls || fragment.tle_urls || fragment.tleUrls) merged.tle_sources = fragment.tle_sources || fragment.tle_update_urls || fragment.tleUpdateUrls || fragment.tle_urls || fragment.tleUrls;
    if (fragment.tle) merged.tle = fragment.tle;

    for (const key of [
      "input_root", "output_root", "observation_date", "folder_name", "timezone",
      "uplink_base_frequency_hz", "downlink_base_frequency_hz", "min_elevation_deg",
    ]) {
      if (Object.prototype.hasOwnProperty.call(fragment, key)) merged[key] = fragment[key];
    }
  }
  return merged;
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isoLocalBrowser(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function timeHmsBrowser(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? 0 : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

function zonedDateToUtc(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function parseObservationStartUtc(observationDate, timeZone) {
  const [year, month, day] = safeString(observationDate).split("-").map(Number);
  if (!year || !month || !day) throw new Error("observation_date は YYYY-MM-DD 形式で指定してください。");
  return zonedDateToUtc(year, month, day, 0, 0, 0, timeZone);
}

function formatHmsInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

function formatCompactDateInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${p.year}${pad2(p.month)}${pad2(p.day)}`;
}

function formatYmdInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function isOneDayMode(mode) {
  const selected = safeString(mode, "1day").toLowerCase();
  return selected === "1day" || selected === "day" || selected === "today";
}

function predictionStartDateFromMode(now, timeZone, mode, passDate) {
  if (isOneDayMode(mode)) {
    const targetDate = passDate || formatYmdInZone(now, timeZone);
    return parseObservationStartUtc(targetDate, timeZone);
  }
  return now;
}

function predictionHorizonHoursFromMode(now, timeZone, mode) {
  const selected = safeString(mode, "1day").toLowerCase();
  if (isOneDayMode(selected)) return 24;
  return clamp(safeNumber(selected.replace("h", ""), 12), 0.25, 168);
}

function predictionHorizonLabel(mode, hours, passDate = null) {
  if (isOneDayMode(mode)) return `1Day / ${passDate || "selected date"} 00:00-24:00`;
  return `${hours.toFixed(0)} h from now`;
}

function formatMonthDayInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${p.month}/${p.day}`;
}

function formatHmInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function buildPassCopyText(passes, timeZone, operationPassKeys = [], operationPassRegistry = {}) {
  if (!passes.length) return "No visible pass in the selected prediction window.";
  const byDate = new Map();
  for (const pass of passes) {
    const key = formatMonthDayInZone(pass.aos, timeZone);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(pass);
  }

  const lines = [
    "Pass[日付No] [AOS時刻]to[LOS時刻]@MEL=[MEL][deg.] [運用/非運用] の形式で書いております",
    "",
  ];
  for (const [dateLabel, datePasses] of byDate.entries()) {
    lines.push(dateLabel);
    datePasses.forEach((pass, index) => {
      const opsLabel = findOperationKeyForPass(pass, operationPassKeys, operationPassRegistry) ? "運用" : "非運用";
      lines.push(`Pass[${pad2(index + 1)}] ${formatHmInZone(pass.aos, timeZone)} to ${formatHmInZone(pass.los, timeZone)} @ MEL=${pass.maxElDeg.toFixed(1)}[deg.] [${opsLabel}]`);
    });
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatSignedMinutes(value) {
  const n = safeNumber(value, 0);
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)} min`;
}

function formatIsoInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

function formatUtcHms(date) {
  return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
}

function formatDuration(ms) {
  const sign = ms < 0 ? "-" : "";
  let total = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const days = Math.floor(total / 86400);
  total -= days * 86400;
  const hours = Math.floor(total / 3600);
  total -= hours * 3600;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${sign}${days > 0 ? `${days}d ` : ""}${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function buildPassTimer(passes, now, timeZone, selectedPass = null, selectedLabel = null) {
  if (selectedPass) {
    const prefix = selectedLabel ? `${selectedLabel} / ` : "selected / ";
    if (now < selectedPass.aos) {
      return {
        phase: "AOS",
        value: formatDuration(selectedPass.aos.getTime() - now.getTime()),
        sub: `${prefix}to AOS ${formatIsoInZone(selectedPass.aos, timeZone)}`,
        inPass: false,
        selected: true,
        targetPass: selectedPass,
      };
    }
    if (now <= selectedPass.los) {
      return {
        phase: "LOS",
        value: formatDuration(selectedPass.los.getTime() - now.getTime()),
        sub: `${prefix}to LOS ${formatIsoInZone(selectedPass.los, timeZone)}`,
        inPass: true,
        selected: true,
        targetPass: selectedPass,
      };
    }
    return {
      phase: "DONE",
      value: "00:00:00",
      sub: `${prefix}ended ${formatIsoInZone(selectedPass.los, timeZone)}`,
      inPass: false,
      selected: true,
      targetPass: selectedPass,
    };
  }

  const active = passes.find((pass) => now >= pass.aos && now <= pass.los);
  if (active) {
    return {
      phase: "LOS",
      value: formatDuration(active.los.getTime() - now.getTime()),
      sub: `auto / to LOS ${formatIsoInZone(active.los, timeZone)}`,
      inPass: true,
      selected: false,
      targetPass: active,
    };
  }
  const next = passes.find((pass) => pass.aos > now) || passes[0];
  if (next) {
    return {
      phase: "AOS",
      value: formatDuration(next.aos.getTime() - now.getTime()),
      sub: `auto / to AOS ${formatIsoInZone(next.aos, timeZone)}`,
      inPass: false,
      selected: false,
      targetPass: next,
    };
  }
  return { phase: "AOS", value: "--:--:--", sub: "no pass in prediction window", inPass: false, selected: false, targetPass: null };
}

function buildCommandPassTimer(pass, now, timeZone, commandElevationDeg) {
  const cmdEl = safeNumber(commandElevationDeg, 0);
  if (!pass) {
    return { phase: "CMD", value: "--:--:--", sub: `cmd ≥ ${cmdEl.toFixed(1)} deg / no target pass`, active: false };
  }
  if (!pass.commandAos || !pass.commandLos) {
    return {
      phase: "CMD",
      value: "--:--:--",
      sub: `cmd ≥ ${cmdEl.toFixed(1)} deg / no command window`,
      active: false,
    };
  }
  if (now < pass.commandAos) {
    return {
      phase: "CMD AOS",
      value: formatDuration(pass.commandAos.getTime() - now.getTime()),
      sub: `cmd ≥ ${cmdEl.toFixed(1)} deg / to ${formatIsoInZone(pass.commandAos, timeZone)}`,
      active: false,
    };
  }
  if (now <= pass.commandLos) {
    return {
      phase: "CMD LOS",
      value: formatDuration(pass.commandLos.getTime() - now.getTime()),
      sub: `cmd ≥ ${cmdEl.toFixed(1)} deg / to ${formatIsoInZone(pass.commandLos, timeZone)}`,
      active: true,
    };
  }
  return {
    phase: "CMD DONE",
    value: "00:00:00",
    sub: `cmd ended ${formatIsoInZone(pass.commandLos, timeZone)}`,
    active: false,
  };
}

function computeSatState(tle, date) {
  try {
    const satrec = satellite.twoline2satrec(tle.line1.trim(), tle.line2.trim());
    const pv = satellite.propagate(satrec, date);
    if (!pv || !pv.position || !pv.velocity) return null;

    const gmst = satellite.gstime(date);
    const geodetic = satellite.eciToGeodetic(pv.position, gmst);
    return {
      positionEciKm: pv.position,
      velocityEciKmS: pv.velocity,
      latDeg: satellite.degreesLat(geodetic.latitude),
      lonDeg: satellite.degreesLong(geodetic.longitude),
      altKm: geodetic.height,
      gmst,
    };
  } catch {
    return null;
  }
}

function computeLookAngles(satState, station) {
  if (!satState || !station) return null;
  const observerGd = {
    latitude: station.latDeg * DEG2RAD,
    longitude: station.lonDeg * DEG2RAD,
    height: station.heightM / 1000,
  };
  const ecf = satellite.eciToEcf(satState.positionEciKm, satState.gmst);
  const look = satellite.ecfToLookAngles(observerGd, ecf);
  const azDeg = ((look.azimuth * RAD2DEG) + 360) % 360;
  const elDeg = look.elevation * RAD2DEG;
  const rangeKm = look.rangeSat;
  return { azDeg, elDeg, rangeKm, visible: elDeg >= station.minElevationDeg };
}

function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function norm3(a) {
  return Math.sqrt(dot3(a, a));
}

function observerEciStateKm(station, gmst) {
  // tle_pass_csv_exporter.py の Skyfield 実装に寄せるため、
  // レンジレートは「レンジの時間差分」ではなく、
  // topocentric position / velocity のLOS方向射影で計算する。
  // satellite.js のSGP4出力はTEME系相当だが、同じGMST近似で観測局をECI側へ戻すことで、
  // look angle 計算と整合した近似系で相対速度を扱う。
  const observerGd = {
    latitude: station.latDeg * DEG2RAD,
    longitude: station.lonDeg * DEG2RAD,
    height: station.heightM / 1000,
  };
  const observerEcf = satellite.geodeticToEcf(observerGd);
  const observerEci = satellite.ecfToEci(observerEcf, gmst);

  // ECEF固定の地上局を慣性系で見た速度。
  // v = omega_E x r。単位は km/s。
  const observerVelEci = {
    x: -EARTH_OMEGA_RAD_S * observerEci.y,
    y: EARTH_OMEGA_RAD_S * observerEci.x,
    z: 0,
  };

  return { positionEciKm: observerEci, velocityEciKmS: observerVelEci };
}

function computeTopocentricRangeRateMps(state, station) {
  if (!state || !station) return 0;
  try {
    const observer = observerEciStateKm(station, state.gmst);
    const rhoKm = sub3(state.positionEciKm, observer.positionEciKm);
    const rhoDotKmS = sub3(state.velocityEciKmS, observer.velocityEciKmS);
    const rhoNormKm = norm3(rhoKm);
    if (!Number.isFinite(rhoNormKm) || rhoNormKm <= 0) return 0;
    return 1000.0 * dot3(rhoKm, rhoDotKmS) / rhoNormKm;
  } catch {
    return 0;
  }
}

function computeObservation(tle, station, date) {
  const state = computeSatState(tle, date);
  const look = state ? computeLookAngles(state, station) : null;
  if (!look) return null;

  const rangeRateMps = computeTopocentricRangeRateMps(state, station);
  return { ...look, rangeRateMps, state };
}

function groundRangeFromElevation(altKm, minElevationDeg) {
  const e = minElevationDeg * DEG2RAD;
  const rho = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(altKm, 1e-6));
  const psi = Math.acos(clamp(rho * Math.cos(e), -1, 1)) - e;
  return Math.max(0, psi * RAD2DEG);
}

function destinationPoint(latDeg, lonDeg, bearingDeg, angularDistanceDeg) {
  const lat1 = latDeg * DEG2RAD;
  const lon1 = lonDeg * DEG2RAD;
  const brg = bearingDeg * DEG2RAD;
  const d = angularDistanceDeg * DEG2RAD;
  const sinLat2 = Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg);
  const lat2 = Math.asin(clamp(sinLat2, -1, 1));
  const y = Math.sin(brg) * Math.sin(d) * Math.cos(lat1);
  const x = Math.cos(d) - Math.sin(lat1) * Math.sin(lat2);
  const lon2 = lon1 + Math.atan2(y, x);
  return { latDeg: lat2 * RAD2DEG, lonDeg: normalizeLon(lon2 * RAD2DEG) };
}

function geoToXY(latDeg, lonDeg, width, height, projection = "mercator") {
  const x = ((normalizeLon(lonDeg) + 180) / 360) * width;
  if (projection === "mercator") {
    const maxLat = 85.05112878;
    const lat = clamp(latDeg, -maxLat, maxLat) * DEG2RAD;
    const y = ((1 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / Math.PI) / 2) * height;
    return { x, y };
  }
  const y = ((90 - latDeg) / 180) * height;
  return { x, y };
}

function sampleTrack(tle, now, trackConfig) {
  const minutesBefore = safeNumber(trackConfig?.trackMinutesBefore, 45);
  const minutesAfter = safeNumber(trackConfig?.trackMinutesAfter, 90);
  const stepSec = safeNumber(trackConfig?.trackStepSec, 60);
  const points = [];
  for (let dt = -minutesBefore * 60; dt <= minutesAfter * 60; dt += stepSec) {
    const date = new Date(now.getTime() + dt * 1000);
    const state = computeSatState(tle, date);
    if (state) points.push({ ...state, date });
  }
  return points;
}

function splitPolylineAtDateLine(points) {
  const lines = [];
  let current = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (i > 0 && Math.abs(point.lonDeg - points[i - 1].lonDeg) > 180) {
      if (current.length > 1) lines.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 1) lines.push(current);
  return lines;
}


function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function sunEciVectorKm(date) {
  const jd = julianDate(date);
  const n = jd - 2451545.0;
  const meanLon = ((280.460 + 0.9856474 * n) % 360 + 360) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360 + 360) % 360;
  const g = meanAnomaly * DEG2RAD;
  const eclipticLon = (meanLon + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG2RAD;
  const obliquity = (23.439291 - 0.0000004 * n) * DEG2RAD;
  const distanceAu = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  const distanceKm = distanceAu * AU_KM;
  const x = Math.cos(eclipticLon) * distanceKm;
  const y = Math.cos(obliquity) * Math.sin(eclipticLon) * distanceKm;
  const z = Math.sin(obliquity) * Math.sin(eclipticLon) * distanceKm;
  return { x, y, z, distanceKm };
}

function sunEciUnit(date) {
  const sun = sunEciVectorKm(date);
  const r = Math.hypot(sun.x, sun.y, sun.z) || 1;
  return { x: sun.x / r, y: sun.y / r, z: sun.z / r };
}

function sunSubpoint(date) {
  const sun = sunEciUnit(date);
  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(sun, gmst);
  const r = Math.hypot(ecf.x, ecf.y, ecf.z) || 1;
  return {
    latDeg: Math.asin(clamp(ecf.z / r, -1, 1)) * RAD2DEG,
    lonDeg: normalizeLon(Math.atan2(ecf.y, ecf.x) * RAD2DEG),
  };
}

function solarElevationDeg(latDeg, lonDeg, subsolar) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const subLat = subsolar.latDeg * DEG2RAD;
  const subLon = subsolar.lonDeg * DEG2RAD;
  const cosZenith = Math.sin(lat) * Math.sin(subLat) + Math.cos(lat) * Math.cos(subLat) * Math.cos(lon - subLon);
  return Math.asin(clamp(cosZenith, -1, 1)) * RAD2DEG;
}

function computeGroundLightStatus(station, date) {
  if (!station) return { mode: "--", solarElevationDeg: null };
  const subsolar = sunSubpoint(date);
  const el = solarElevationDeg(station.latDeg, station.lonDeg, subsolar);
  const mode = el >= 0 ? "DAY" : el >= -6 ? "TWILIGHT" : "NIGHT";
  return { mode, solarElevationDeg: el };
}

function computeEclipseStatus(satState, date) {
  if (!satState?.positionEciKm) return { mode: "UNKNOWN", sunlit: false, separationDeg: null, earthAngularDeg: null, sunAngularDeg: null };

  const rSat = satState.positionEciKm;
  const sun = sunEciVectorKm(date);

  const toEarth = { x: -rSat.x, y: -rSat.y, z: -rSat.z };
  const toSun = { x: sun.x - rSat.x, y: sun.y - rSat.y, z: sun.z - rSat.z };

  const dEarth = Math.hypot(toEarth.x, toEarth.y, toEarth.z);
  const dSun = Math.hypot(toSun.x, toSun.y, toSun.z);
  const dot = toEarth.x * toSun.x + toEarth.y * toSun.y + toEarth.z * toSun.z;
  const separation = Math.acos(clamp(dot / Math.max(dEarth * dSun, 1e-12), -1, 1));
  const earthAngular = Math.asin(clamp(EARTH_RADIUS_KM / Math.max(dEarth, EARTH_RADIUS_KM), -1, 1));
  const sunAngular = Math.asin(clamp(SUN_RADIUS_KM / Math.max(dSun, SUN_RADIUS_KM), -1, 1));

  let mode = "SUNLIT";
  if (separation < Math.max(0, earthAngular - sunAngular)) mode = "UMBRA";
  else if (separation < earthAngular + sunAngular) mode = "PENUMBRA";

  return {
    mode,
    sunlit: mode === "SUNLIT",
    separationDeg: separation * RAD2DEG,
    earthAngularDeg: earthAngular * RAD2DEG,
    sunAngularDeg: sunAngular * RAD2DEG,
  };
}

function isSatelliteSunlit(satState, date) {
  return computeEclipseStatus(satState, date).sunlit;
}

function projectedSegments(points, width, height, projection) {
  const segments = [];
  let current = [];
  for (const point of points) {
    const p = geoToXY(point.latDeg, point.lonDeg, width, height, projection);
    if (current.length > 0) {
      const prev = current[current.length - 1];
      if (Math.abs(p.x - prev.x) > width * 0.5) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
    }
    current.push(p);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

function pathFromProjectedSegment(segment, close = false) {
  const d = segment
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  return close ? `${d} Z` : d;
}

function NightOverlay({ now, width, height, projection }) {
  const { cells, subsolar, terminatorSegments } = useMemo(() => {
    const sub = sunSubpoint(now);
    const rects = [];
    const lonStep = 4;
    const latStep = 4;
    for (let lat = -80; lat < 80; lat += latStep) {
      for (let lon = -180; lon < 180; lon += lonStep) {
        const midLat = lat + latStep / 2;
        const midLon = lon + lonStep / 2;
        if (solarElevationDeg(midLat, midLon, sub) < 0) {
          const p1 = geoToXY(lat + latStep, lon, width, height, projection);
          const p2 = geoToXY(lat, lon + lonStep, width, height, projection);
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const w = Math.abs(p2.x - p1.x);
          const h = Math.abs(p2.y - p1.y);
          rects.push({ x, y, w, h });
        }
      }
    }
    const terminator = Array.from({ length: 361 }, (_, bearing) => destinationPoint(sub.latDeg, sub.lonDeg, bearing, 90));
    return { cells: rects, subsolar: sub, terminatorSegments: projectedSegments(terminator, width, height, projection) };
  }, [now, width, height, projection]);

  const sub = geoToXY(subsolar.latDeg, subsolar.lonDeg, width, height, projection);
  return (
    <g className="night-overlay">
      {cells.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w + 0.8} height={r.h + 0.8} className="night-cell" />)}
      {terminatorSegments.map((segment, i) => <path key={`terminator-${i}`} d={pathFromProjectedSegment(segment)} className="terminator-line" />)}
      <circle cx={sub.x} cy={sub.y} r="5" className="subsolar-dot" />
      <text x={sub.x + 8} y={sub.y - 8} className="subsolar-label">SUN</text>
    </g>
  );
}

function elevationMinusThreshold(tle, station, date, thresholdDeg) {
  const obs = computeObservation(tle, station, date);
  if (!obs || !Number.isFinite(obs.elDeg)) return null;
  return obs.elDeg - thresholdDeg;
}

function findElevationCrossingTime(tle, station, leftMs, rightMs, thresholdDeg) {
  let lo = leftMs;
  let hi = rightMs;
  let flo = elevationMinusThreshold(tle, station, new Date(lo), thresholdDeg);
  let fhi = elevationMinusThreshold(tle, station, new Date(hi), thresholdDeg);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return new Date(Math.round((leftMs + rightMs) / 2));
  if (Math.abs(flo) < 1e-9) return new Date(lo);
  if (Math.abs(fhi) < 1e-9) return new Date(hi);
  if (flo * fhi > 0) {
    return new Date(Math.round((leftMs + rightMs) / 2));
  }

  for (let i = 0; i < 42; i += 1) {
    const mid = Math.round((lo + hi) / 2);
    const fm = elevationMinusThreshold(tle, station, new Date(mid), thresholdDeg);
    if (!Number.isFinite(fm)) break;
    if (Math.abs(fm) < 1e-7 || hi - lo <= 20) return new Date(mid);
    if (flo * fm <= 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return new Date(Math.round((lo + hi) / 2));
}

function findMaxElevationInInterval(tle, station, startMs, endMs) {
  if (endMs <= startMs) {
    const date = new Date(startMs);
    return { date, obs: computeObservation(tle, station, date) };
  }
  let lo = startMs;
  let hi = endMs;
  for (let i = 0; i < 36; i += 1) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const e1 = computeObservation(tle, station, new Date(Math.round(m1)))?.elDeg ?? -999;
    const e2 = computeObservation(tle, station, new Date(Math.round(m2)))?.elDeg ?? -999;
    if (e1 < e2) lo = m1;
    else hi = m2;
  }
  const candidates = [];
  const center = Math.round((lo + hi) / 2);
  for (let dt = -2000; dt <= 2000; dt += 250) {
    const ms = clamp(center + dt, startMs, endMs);
    const date = new Date(Math.round(ms));
    const obs = computeObservation(tle, station, date);
    if (obs) candidates.push({ date, obs });
  }
  if (!candidates.length) {
    const date = new Date(center);
    return { date, obs: computeObservation(tle, station, date) };
  }
  return candidates.reduce((best, item) => item.obs.elDeg > best.obs.elDeg ? item : best, candidates[0]);
}

function buildVisibleRows(tle, station, aos, los, thresholdDeg, stepSec = 1) {
  const rows = [];
  const startMs = Math.ceil(aos.getTime() / 1000) * 1000;
  const endMs = Math.floor(los.getTime() / 1000) * 1000;
  for (let ms = startMs; ms <= endMs; ms += stepSec * 1000) {
    const date = new Date(ms);
    const obs = computeObservation(tle, station, date);
    if (obs && obs.elDeg >= thresholdDeg - 1e-6) rows.push({ date, obs });
  }
  if (!rows.length) {
    const mid = new Date(Math.round((aos.getTime() + los.getTime()) / 2));
    const obs = computeObservation(tle, station, mid);
    if (obs) rows.push({ date: mid, obs });
  }
  return rows;
}

function commandWindowForPass(tle, station, pass, commandElevationDeg) {
  const cmdEl = safeNumber(commandElevationDeg, station?.minElevationDeg ?? 0);
  if (!pass || !Number.isFinite(cmdEl)) return { commandAos: null, commandLos: null };
  if (cmdEl <= (station?.minElevationDeg ?? 0) + 1e-9) return { commandAos: pass.aos, commandLos: pass.los };
  if (!Number.isFinite(pass.maxElDeg) || pass.maxElDeg < cmdEl) return { commandAos: null, commandLos: null };
  const aos = findElevationCrossingTime(tle, station, pass.aos.getTime(), pass.maxElTime.getTime(), cmdEl);
  const los = findElevationCrossingTime(tle, station, pass.maxElTime.getTime(), pass.los.getTime(), cmdEl);
  return { commandAos: aos, commandLos: los };
}

function refinePassFromBracket(tle, station, bracketStartMs, bracketEndMs, visibleThresholdDeg, commandElevationDeg = null, stepSec = 1) {
  const aos = findElevationCrossingTime(tle, station, bracketStartMs, bracketEndMs, visibleThresholdDeg);
  // This function is used for a single transition bracket only by callers that provide
  // explicit AOS/LOS brackets. It is kept for compatibility but not used directly.
  return { aos, los: aos };
}

function buildPassFromCrossings(tle, station, aosMs, losMs, visibleThresholdDeg, commandElevationDeg = null, stepSec = 1) {
  const aos = new Date(aosMs);
  const los = new Date(losMs);
  const max = findMaxElevationInInterval(tle, station, aosMs, losMs);
  const rows = buildVisibleRows(tle, station, aos, los, visibleThresholdDeg, stepSec);
  let minRange = rows[0] || max;
  for (const row of rows) {
    if ((row.obs?.rangeKm ?? Infinity) < (minRange.obs?.rangeKm ?? Infinity)) minRange = row;
  }
  const pass = {
    aos,
    los,
    maxElDeg: max?.obs?.elDeg ?? 0,
    maxElTime: max?.date ?? new Date(Math.round((aosMs + losMs) / 2)),
    rangeAtMaxElKm: max?.obs?.rangeKm ?? minRange?.obs?.rangeKm ?? 0,
    minRangeKm: minRange?.obs?.rangeKm ?? max?.obs?.rangeKm ?? 0,
    rows,
  };
  return { ...pass, ...commandWindowForPass(tle, station, pass, commandElevationDeg ?? visibleThresholdDeg) };
}

function predictPasses(tle, station, startDate, horizonHours = 12, stepSec = 30, commandElevationDeg = null) {
  const visibleThresholdDeg = safeNumber(station?.minElevationDeg, 0);
  const stepMs = Math.max(1, safeNumber(stepSec, 30)) * 1000;
  const requestedStartMs = startDate.getTime();
  const requestedEndMs = requestedStartMs + horizonHours * 3600 * 1000;
  const searchStartMs = requestedStartMs - 90 * 60 * 1000;
  const searchEndMs = requestedEndMs + 90 * 60 * 1000;
  const intervals = [];

  let prevMs = searchStartMs;
  let prevObs = computeObservation(tle, station, new Date(prevMs));
  let prevVisible = !!prevObs && prevObs.elDeg >= visibleThresholdDeg;
  let inPass = prevVisible;
  let aosBracket = inPass ? { left: searchStartMs, right: searchStartMs } : null;
  let passStartMs = inPass ? searchStartMs : null;

  for (let ms = searchStartMs + stepMs; ms <= searchEndMs; ms += stepMs) {
    const obs = computeObservation(tle, station, new Date(ms));
    const visible = !!obs && obs.elDeg >= visibleThresholdDeg;
    if (visible && !prevVisible) {
      aosBracket = { left: prevMs, right: ms };
      passStartMs = findElevationCrossingTime(tle, station, prevMs, ms, visibleThresholdDeg).getTime();
      inPass = true;
    } else if (!visible && prevVisible && inPass) {
      const losMs = findElevationCrossingTime(tle, station, prevMs, ms, visibleThresholdDeg).getTime();
      intervals.push({ aosMs: passStartMs ?? (aosBracket ? findElevationCrossingTime(tle, station, aosBracket.left, aosBracket.right, visibleThresholdDeg).getTime() : prevMs), losMs });
      inPass = false;
      passStartMs = null;
      aosBracket = null;
    }
    prevMs = ms;
    prevObs = obs;
    prevVisible = visible;
  }
  if (inPass && passStartMs !== null) intervals.push({ aosMs: passStartMs, losMs: searchEndMs });

  return intervals
    .filter((interval) => interval.losMs >= requestedStartMs && interval.aosMs <= requestedEndMs)
    .map((interval) => buildPassFromCrossings(tle, station, interval.aosMs, interval.losMs, visibleThresholdDeg, commandElevationDeg, 1))
    .filter(Boolean)
    .slice(0, 64);
}

function refineVisiblePass(tle, station, startMs, endMs, stepSec = 1, commandElevationDeg = null) {
  const visibleThresholdDeg = safeNumber(station?.minElevationDeg, 0);
  let prevMs = startMs;
  let prevObs = computeObservation(tle, station, new Date(prevMs));
  let prevVisible = !!prevObs && prevObs.elDeg >= visibleThresholdDeg;
  let aosMs = null;
  let losMs = null;
  for (let ms = startMs + 1000; ms <= endMs; ms += 1000) {
    const obs = computeObservation(tle, station, new Date(ms));
    const visible = !!obs && obs.elDeg >= visibleThresholdDeg;
    if (visible && !prevVisible && aosMs === null) aosMs = findElevationCrossingTime(tle, station, prevMs, ms, visibleThresholdDeg).getTime();
    if (!visible && prevVisible && aosMs !== null) {
      losMs = findElevationCrossingTime(tle, station, prevMs, ms, visibleThresholdDeg).getTime();
      break;
    }
    prevMs = ms;
    prevObs = obs;
    prevVisible = visible;
  }
  if (aosMs === null && prevVisible) aosMs = startMs;
  if (aosMs === null) return null;
  if (losMs === null) losMs = endMs;
  return buildPassFromCrossings(tle, station, aosMs, losMs, visibleThresholdDeg, commandElevationDeg, stepSec);
}

function computeDayPassesForExport(tle, station, ops) {
  const tz = ops.timezone || "Asia/Tokyo";
  const dayStart = parseObservationStartUtc(ops.observationDate, tz);
  const passes = predictPasses(tle, station, dayStart, 24, 10, ops.commandElevationDeg);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  return passes.filter((pass) => pass.los >= dayStart && pass.aos <= dayEnd);
}

function sanitizePathPart(text) {
  return safeString(text, "output").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "output";
}

function frequencyRowsForPass(pass, ops) {
  const tz = ops.timezone || "Asia/Tokyo";
  const uplink = [];
  const downlink = [];
  for (const row of pass.rows) {
    const vr = row.obs.rangeRateMps;
    const ratio = 1 - vr / C_MPS;
    const fDown = ops.downlinkBaseFrequencyHz * ratio;
    const fUp = ops.uplinkBaseFrequencyHz / ratio;
    const t = formatHmsInZone(row.date, tz);
    const common = `${row.obs.azDeg.toFixed(6)},${row.obs.elDeg.toFixed(6)}`;
    uplink.push(`${t},${fUp.toFixed(3)},${common}`);
    downlink.push(`${t},${fDown.toFixed(3)},${common}`);
  }
  return { uplink: `${uplink.join("\n")}\n`, downlink: `${downlink.join("\n")}\n` };
}

async function buildDopplerZip({ appConfig, opsConfig, mapConfig, radarConfig, orbitTrackConfig, sat, station, observationDateOverride = null }) {
  const zip = new JSZip();
  const exportOpsConfig = { ...opsConfig, observationDate: observationDateOverride || opsConfig.observationDate };
  const passes = computeDayPassesForExport(sat, station, exportOpsConfig);
  const tz = exportOpsConfig.timezone || "Asia/Tokyo";
  const dayStart = parseObservationStartUtc(exportOpsConfig.observationDate, tz);
  const ymd = formatCompactDateInZone(dayStart, tz);
  const rootName = `${ymd}_${sanitizePathPart(exportOpsConfig.folderName)}`;
  const root = zip.folder(rootName);

  if (!root) throw new Error("ZIP フォルダの作成に失敗しました。");

  const config = exportableConfig(appConfig, exportOpsConfig, mapConfig, radarConfig || normalizeRadar({}), orbitTrackConfig || normalizeOrbitTrack({}), [], sat, station);
  root.file("config_used.yaml", dumpYaml(config));

  const manifestLines = [
    "SatPass Ops Console - Doppler CSV Export",
    `generated_at_utc: ${new Date().toISOString()}`,
    `observation_date: ${exportOpsConfig.observationDate}`,
    `timezone: ${tz}`,
    `satellite: ${sat.name}`,
    `ground_station: ${station.name}`,
    `min_elevation_deg: ${station.minElevationDeg}`,
    `uplink_base_frequency_hz: ${exportOpsConfig.uplinkBaseFrequencyHz}`,
    `downlink_base_frequency_hz: ${exportOpsConfig.downlinkBaseFrequencyHz}`,
    `pass_count: ${passes.length}`,
    "csv_format: [時刻],[周波数(ドップラー補正済みHz)],[方位角deg],[仰角deg]",
    "doppler_sign: range_rate > 0 means receding; downlink=f0*(1-vr/c), uplink=f0/(1-vr/c)",
    "range_rate_method: topocentric_position_velocity_projection; aligned with tle_pass_csv_exporter.py",
    "",
  ];

  passes.forEach((pass, index) => {
    const idx = String(index + 1).padStart(2, "0");
    const aos = formatHmsInZone(pass.aos, tz).replaceAll(":", "");
    const max = formatHmsInZone(pass.maxElTime, tz).replaceAll(":", "");
    const los = formatHmsInZone(pass.los, tz).replaceAll(":", "");
    const satName = sanitizePathPart(sat.name);
    const passKey = `${satName}_${ymd}_AOS${aos}`;
    const csv = frequencyRowsForPass(pass, exportOpsConfig);

    root.file(`${passKey}_uplink.csv`, csv.uplink);
    root.file(`${passKey}_downlink.csv`, csv.downlink);

    manifestLines.push(`pass_${idx}: AOS=${formatIsoInZone(pass.aos, tz)}, MAX=${formatIsoInZone(pass.maxElTime, tz)} (${pass.maxElDeg.toFixed(2)} deg), LOS=${formatIsoInZone(pass.los, tz)}, min_range=${pass.minRangeKm.toFixed(1)} km`);
    manifestLines.push(`  files: ${passKey}_uplink.csv, ${passKey}_downlink.csv`);
    manifestLines.push(`  legacy_pass_name: pass_${idx}_AOS_${aos}_MAX_${max}_LOS_${los}`);
  });

  root.file("manifest.txt", `${manifestLines.join("\n")}\n`);
  return { blob: await zip.generateAsync({ type: "blob" }), filename: `${rootName}_doppler_csv.zip`, passCount: passes.length };
}


function trackColorForMode(mode, tle, orbitTrackConfig) {
  if (orbitTrackConfig?.colorMode !== "sunlight") return tle.color;
  if (mode === "UMBRA") return orbitTrackConfig.umbraColor || "#7c3aed";
  if (mode === "PENUMBRA") return orbitTrackConfig.penumbraColor || "#f59e0b";
  return orbitTrackConfig?.sunlitColor || "#22c55e";
}

function buildTrackRenderSegments(track, width, height, projection, tle, orbitTrackConfig) {
  const segments = [];
  for (let i = 1; i < track.length; i += 1) {
    const a = track[i - 1];
    const b = track[i];
    const pa = geoToXY(a.latDeg, a.lonDeg, width, height, projection);
    const pb = geoToXY(b.latDeg, b.lonDeg, width, height, projection);
    if (Math.abs(pa.x - pb.x) > width * 0.5) continue;
    const mode = computeEclipseStatus(b, b.date).mode;
    segments.push({ points: [pa, pb], mode, color: trackColorForMode(mode, tle, orbitTrackConfig) });
  }
  return segments;
}

function trackDashForMode(mode, orbitTrackConfig) {
  if (orbitTrackConfig?.colorMode !== "sunlight") return undefined;
  if (mode === "UMBRA") return "5 4";
  if (mode === "PENUMBRA") return "9 4";
  return undefined;
}

function SevenSegment({ label, value, sub, accent }) {
  return (
    <div className={`seven-card ${accent || ""}`}>
      <div className="seven-label">{label}</div>
      <div className="seven-value">{value}</div>
      {sub ? <div className="seven-sub">{sub}</div> : null}
    </div>
  );
}

function radarPointFromAzEl(azDeg, elDeg, cx, cy, rMax) {
  const radial = clamp((90 - Math.max(elDeg, 0)) / 90, 0, 1) * rMax;
  const theta = (azDeg - 90) * DEG2RAD;
  return { x: cx + radial * Math.cos(theta), y: cy + radial * Math.sin(theta) };
}

function splitDelimitedLine(line) {
  if (line.includes(",")) return line.split(",").map((item) => item.trim());
  if (line.includes("	")) return line.split("	").map((item) => item.trim());
  return line.trim().split(/\s+/).map((item) => item.trim());
}

function findColumnIndex(headers, candidates) {
  const normalized = headers.map((header) => safeString(header).trim().toLowerCase().replace(/[\s_\-\[\]()\.]/g, ""));
  return normalized.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}

function parseSkylineCsv(text) {
  const lines = safeString(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!lines.length) return [];

  const first = splitDelimitedLine(lines[0]);
  const firstNumbers = first.map((value) => Number(value));
  const hasHeader = firstNumbers.some((value) => !Number.isFinite(value));
  let azIndex = 0;
  let elIndex = 1;
  let dataLines = lines;

  if (hasHeader) {
    const headers = first;
    const detectedAz = findColumnIndex(headers, ["az", "azimuth", "azimuthdeg", "azdeg", "bearing", "方位", "方位角"]);
    const detectedEl = findColumnIndex(headers, ["el", "elev", "elevation", "elevationdeg", "eldeg", "elevdeg", "altitude", "仰角"]);
    azIndex = detectedAz >= 0 ? detectedAz : 0;
    elIndex = detectedEl >= 0 ? detectedEl : 1;
    dataLines = lines.slice(1);
  }

  const rows = dataLines
    .map((line) => splitDelimitedLine(line))
    .map((cols) => {
      const azRaw = Number(cols[azIndex]);
      const elRaw = Number(cols[elIndex]);
      if (!Number.isFinite(azRaw) || !Number.isFinite(elRaw)) return null;
      return { azDeg: ((azRaw % 360) + 360) % 360, elDeg: clamp(elRaw, 0, 90) };
    })
    .filter(Boolean)
    .sort((a, b) => a.azDeg - b.azDeg);

  const byAz = new Map();
  rows.forEach((row) => byAz.set(row.azDeg.toFixed(3), row));
  return Array.from(byAz.values()).sort((a, b) => a.azDeg - b.azDeg);
}

function skylinePathFromRows(rows, cx, cy, rMax) {
  if (!Array.isArray(rows) || rows.length < 2) return "";
  const normalized = [...rows].sort((a, b) => a.azDeg - b.azDeg);
  const closed = [...normalized];
  if (closed.length && closed[closed.length - 1].azDeg < 359.999) {
    closed.push({ ...closed[0], azDeg: closed[0].azDeg + 360 });
  }
  return closed.map((row, idx) => {
    const az = row.azDeg >= 360 ? row.azDeg - 360 : row.azDeg;
    const p = radarPointFromAzEl(az, row.elDeg, cx, cy, rMax);
    return `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");
}


function sampleRadarPath(tle, station, pass, stepSec = 20) {
  if (!tle || !station || !pass?.aos || !pass?.los) return [];
  const rows = [];
  const step = Math.max(5, stepSec) * 1000;

  // AOS-LOS の可視区間に加え、前後数分を「非可視側の破線」用に含める。
  const marginMs = 5 * 60 * 1000;
  const start = pass.aos.getTime() - marginMs;
  const end = pass.los.getTime() + marginMs;

  for (let ms = start; ms <= end; ms += step) {
    const date = new Date(ms);
    const obs = computeObservation(tle, station, date, 1);
    if (!obs) continue;

    // 極端な地平線下まで描くと外周に不要な線が出るため、少し下までに制限する。
    if (obs.elDeg < -5) continue;

    rows.push({
      date,
      ...obs,
      visibleForRadar: !!obs.visible,
      eclipseMode: computeEclipseStatus(obs.state, date).mode,
    });
  }

  [pass.aos, pass.los].forEach((date) => {
    if (rows.some((row) => Math.abs(row.date.getTime() - date.getTime()) < step / 2)) return;
    const obs = computeObservation(tle, station, date, 1);
    if (obs) rows.push({ date, ...obs, visibleForRadar: !!obs.visible, eclipseMode: computeEclipseStatus(obs.state, date).mode });
  });

  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function pathFromRadarRows(rows, cx, cy, rMax) {
  return rows
    .map((row, idx) => {
      const p = radarPointFromAzEl(row.azDeg, row.elDeg, cx, cy, rMax);
      return `${idx === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");
}

function radarModeForRow(row) {
  if (!row?.visibleForRadar) return "NONVISIBLE";
  const mode = row?.eclipseMode || (row?.state ? computeEclipseStatus(row.state, row.date).mode : "SUNLIT");
  return mode === "SUNLIT" ? "SUNLIT" : "ECLIPSE";
}

function buildRadarRenderSegments(rows, cx, cy, rMax) {
  const segments = [];
  let currentMode = null;
  let currentRows = [];

  rows.forEach((row, index) => {
    const mode = radarModeForRow(row);
    if (currentMode === null) {
      currentMode = mode;
      currentRows = [row];
      return;
    }
    if (mode !== currentMode) {
      if (currentRows.length >= 2) segments.push({ mode: currentMode, rows: currentRows });
      currentMode = mode;
      currentRows = [rows[index - 1], row];
    } else {
      currentRows.push(row);
    }
  });

  if (currentRows.length >= 2) segments.push({ mode: currentMode, rows: currentRows });

  return segments.map((segment) => ({
    mode: segment.mode,
    d: pathFromRadarRows(segment.rows, cx, cy, rMax),
  }));
}

function RadarChart({ look, station, radarConfig, passSeries = [], satMarkers = [], selectedSatName, skylineProfile = null }) {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const rMax = 116;
  const el = look?.elDeg ?? -90;
  const az = look?.azDeg ?? 0;
  const marker = radarPointFromAzEl(az, el, cx, cy, rMax);
  const normalizedSeries = Array.isArray(passSeries) ? passSeries : [];
  const skylineRows = skylineProfile?.rows || radarConfig?.skylineProfile || [];
  const skylinePath = skylinePathFromRows(skylineRows, cx, cy, rMax);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar">
      <defs>
        <clipPath id="radarClip">
          <rect x="0" y="0" width={size} height={size} rx="18" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width={size} height={size} rx="18" className="radar-bg" />
      {radarConfig?.backgroundImageUrl ? (
        <image
          href={radarConfig.backgroundImageUrl}
          x="0"
          y="0"
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid slice"
          opacity={radarConfig.backgroundOpacity ?? 0.45}
          clipPath="url(#radarClip)"
        />
      ) : null}
      {[0, 30, 60].map((elev) => {
        const r = ((90 - elev) / 90) * rMax;
        return <circle key={elev} cx={cx} cy={cy} r={r} className="radar-ring" />;
      })}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((azm) => {
        const t = (azm - 90) * DEG2RAD;
        return <line key={azm} x1={cx} y1={cy} x2={cx + rMax * Math.cos(t)} y2={cy + rMax * Math.sin(t)} className="radar-line" />;
      })}
      <text x={cx} y="22" textAnchor="middle" className="radar-label-strong">N</text>
      <text x={size - 20} y={cy + 5} textAnchor="middle" className="radar-label">E</text>
      <text x={cx} y={size - 14} textAnchor="middle" className="radar-label">S</text>
      <text x="20" y={cy + 5} textAnchor="middle" className="radar-label">W</text>
      {skylinePath ? (
        <path d={skylinePath} className="radar-skyline-csv">
          <title>{`Skyline CSV: ${skylineProfile?.name || "azimuth/elevation profile"}`}</title>
        </path>
      ) : null}
      {normalizedSeries.map((series, seriesIndex) => {
        const rows = series.rows || [];
        const segments = buildRadarRenderSegments(rows, cx, cy, rMax);
        const start = rows[0] ? radarPointFromAzEl(rows[0].azDeg, rows[0].elDeg, cx, cy, rMax) : null;
        const end = rows.length ? radarPointFromAzEl(rows[rows.length - 1].azDeg, rows[rows.length - 1].elDeg, cx, cy, rMax) : null;
        return (
          <g key={series.key || `series-${seriesIndex}`} className={`radar-series radar-series-${seriesIndex % 6}`}>
            {segments.map((segment, idx) => {
              const segmentStyle = segment.mode === "NONVISIBLE"
                ? { stroke: "#94a3b8", strokeDasharray: "3 7", strokeOpacity: 0.54, filter: "none" }
                : (segment.mode === "ECLIPSE" ? { strokeDasharray: "9 6", strokeOpacity: 0.86 } : undefined);
              return (
                <path
                  key={`radar-pass-${seriesIndex}-${idx}`}
                  d={segment.d}
                  className={`radar-pass-segment ${segment.mode.toLowerCase()}`}
                  style={segmentStyle}
                />
              );
            })}
            {start ? <circle cx={start.x} cy={start.y} r="4" className="radar-aos-dot" /> : null}
            {end ? <circle cx={end.x} cy={end.y} r="4" className="radar-los-dot" /> : null}
          </g>
        );
      })}
      {satMarkers.map((sat) => {
        const p = radarPointFromAzEl(sat.azDeg, sat.elDeg, cx, cy, rMax);
        return (
          <circle
            key={sat.id}
            cx={p.x}
            cy={p.y}
            r={sat.isTarget ? 5.5 : 4.2}
            className={sat.visible ? "radar-sat-marker visible" : "radar-sat-marker hidden"}
            fill={sat.color}
          >
            <title>{`${sat.name} / Az ${sat.azDeg.toFixed(1)} deg / El ${sat.elDeg.toFixed(1)} deg`}</title>
          </circle>
        );
      })}
      <circle cx={marker.x} cy={marker.y} r={look?.visible ? "8" : "6"} className={look?.visible ? "sat-visible radar-current" : "sat-hidden"} />
    </svg>
  );
}

function WorldMap({ satellites, stations, now, appConfig, mapConfig, orbitTrackConfig }) {
  const width = 980;
  const height = 470;
  const projection = mapConfig.projection || "mercator";
  const minuteKey = Math.floor(now.getTime() / 60000);
  const satStates = useMemo(
    () => satellites.map((tle) => ({ tle, state: computeSatState(tle, now), track: sampleTrack(tle, now, appConfig) })),
    [satellites, now, appConfig]
  );

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="world-map" role="img" aria-label="Satellite ground track map">
      <defs>
        <pattern id="grid" width="49" height="49" patternUnits="userSpaceOnUse">
          <path d="M 49 0 L 0 0 0 49" fill="none" stroke="rgb(51 65 85)" strokeWidth="0.7" opacity="0.75" />
        </pattern>
        <clipPath id="mapClip">
          <rect x="0" y="0" width={width} height={height} rx="16" />
        </clipPath>
      </defs>

      <g clipPath="url(#mapClip)">
        <rect width={width} height={height} className="map-bg" />
        {mapConfig.backgroundImageUrl ? (
          <image href={mapConfig.backgroundImageUrl} x="0" y="0" width={width} height={height} preserveAspectRatio="none" opacity={mapConfig.backgroundOpacity} />
        ) : null}
        {mapConfig.showSyntheticLand && !mapConfig.backgroundImageUrl ? (
          <path d="M70,176 C125,140 190,140 250,170 C310,202 365,198 420,176 C475,150 530,150 585,176 C645,205 720,205 780,168 C835,137 900,143 945,176 L945,270 C900,250 835,248 780,282 C720,318 645,315 585,285 C530,258 475,258 420,285 C365,312 310,312 250,280 C190,248 125,250 70,280 Z" className="land" />
        ) : null}
        {mapConfig.showGrid ? <rect width={width} height={height} fill="url(#grid)" /> : null}

        <NightOverlay now={new Date(minuteKey * 60000)} width={width} height={height} projection={projection} />

        {[-180, -120, -60, 0, 60, 120].map((lon) => {
          const p = geoToXY(0, lon, width, height, projection);
          return <text key={lon} x={p.x + 3} y={height - 10} className="map-grid-label">{lon}°</text>;
        })}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const p = geoToXY(lat, -180, width, height, projection);
          return <text key={lat} x="6" y={p.y - 4} className="map-grid-label">{lat}°</text>;
        })}

        {stations.map((gs) => {
          const p = geoToXY(gs.latDeg, gs.lonDeg, width, height, projection);
          return (
            <g key={gs.id}>
              <circle cx={p.x} cy={p.y} r="6" className="gs-dot" />
              <circle cx={p.x} cy={p.y} r="12" className="gs-halo" />
              <text x={p.x + 10} y={p.y - 9} className="gs-label">{gs.name}</text>
            </g>
          );
        })}

        {satStates.map(({ tle, state, track }) => {
          if (!state) return null;
          const p = geoToXY(state.latDeg, state.lonDeg, width, height, projection);
          const eclipse = computeEclipseStatus(state, now);
          const sunlit = eclipse.sunlit;
          const rangeDeg = groundRangeFromElevation(state.altKm, 0);
          const footprint = Array.from({ length: 145 }, (_, i) => destinationPoint(state.latDeg, state.lonDeg, i * 2.5, rangeDeg));
          const footprintSegments = projectedSegments(footprint, width, height, projection);
          const trackSegments = buildTrackRenderSegments(track, width, height, projection, tle, orbitTrackConfig);

          return (
            <g key={tle.id}>
              {footprintSegments.map((segment, idx) => (
                <path
                  key={`footprint-${idx}`}
                  d={pathFromProjectedSegment(segment, footprintSegments.length === 1)}
                  fill={footprintSegments.length === 1 ? tle.color : "none"}
                  fillOpacity="0.09"
                  stroke={tle.color}
                  strokeWidth="1.2"
                  strokeOpacity="0.55"
                />
              ))}
              {trackSegments.map((segment, idx) => (
                <path
                  key={`track-${idx}`}
                  d={pathFromProjectedSegment(segment.points)}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="2.0"
                  strokeOpacity="0.95"
                  strokeDasharray={trackDashForMode(segment.mode, orbitTrackConfig)}
                />
              ))}
              <circle cx={p.x} cy={p.y} r="14" className={sunlit ? "sunlit-halo" : "eclipse-halo"} />
              <circle cx={p.x} cy={p.y} r="7" fill={tle.color} />
              <text x={p.x + 10} y={p.y - 10} className="sat-label">{tle.name}</text>
              {orbitTrackConfig?.showEclipseLabel ? <text x={p.x + 10} y={p.y + 8} className={sunlit ? "sunlit-label" : "eclipse-label"}>{eclipse.mode}</text> : null}
            </g>
          );
        })}
      </g>

      <text x="18" y="28" className="map-caption">{projection} map / night-side shading / {mapConfig.attribution || "background image supported"}</text>
    </svg>
  );
}


function DataCard({ label, value, accent }) {
  return (
    <div className="data-card">
      <div className="data-label">{label}</div>
      <div className={accent ? `data-value ${accent}` : "data-value"}>{value}</div>
    </div>
  );
}

function DopplerOutputPanel({ csvDate, onCsvDateChange, onExportZip, exporting, selectedSat, selectedStation }) {
  return (
    <section className="doppler-output-strip" aria-label="Doppler CSV output controls">
      <div className="doppler-output-heading">
        <span className="seven-label doppler-output-kicker">DOPPLER CSV OUTPUT</span>
        <div className="doppler-target-chips" aria-label="Doppler output target">
          <span className="doppler-chip"><span>Satellite</span><strong>{selectedSat?.name ?? "--"}</strong></span>
          <span className="doppler-chip"><span>Ground Station</span><strong>{selectedStation?.name ?? "--"}</strong></span>
        </div>
      </div>
      <div className="doppler-output-controls">
        <label className="inline-control doppler-date-control">
          CSV date
          <input type="date" value={csvDate} onChange={(e) => onCsvDateChange?.(e.target.value)} />
        </label>
        <button className="button compact primary export-main-button doppler-export-button" onClick={onExportZip} disabled={exporting}>
          {exporting ? "Exporting..." : "Export Doppler CSV ZIP"}
        </button>
      </div>
    </section>
  );
}


function MapOrbitLegend({ orbitTrackConfig }) {
  return (
    <div className="map-orbit-legend" aria-label="Orbit track legend">
      <span className="muted tiny">Orbit track</span>
      <span className="map-legend-item"><i style={{ background: orbitTrackConfig?.sunlitColor || "#22c55e" }} /> SUNLIT</span>
      <span className="map-legend-item"><i style={{ background: orbitTrackConfig?.penumbraColor || "#f59e0b" }} /> PENUMBRA</span>
      <span className="map-legend-item"><i style={{ background: orbitTrackConfig?.umbraColor || "#7c3aed" }} /> UMBRA</span>
      <span className="muted tiny">Legend is outside the map canvas.</span>
    </div>
  );
}

function PassTable({
  passes,
  horizonHours,
  passWindowMode,
  onPassWindowModeChange,
  passDate,
  onPassDateChange,
  timeZone,
  selectedPassIndices = [],
  selectedOperationPassKeys = [],
  operationPassRegistry = {},
  onSelectPass,
  onSelectOperationPass,
  onCopyPassText,
}) {
  const selectedSet = new Set(selectedPassIndices);
  const isDay = isOneDayMode(passWindowMode);
  return (
    <section className="panel pass-panel">
      <div className="panel-title-row">
        <h2>Visible Passes</h2>
        <div className="panel-actions-inline pass-tools">
          <label className="inline-control">
            Window
            <select value={passWindowMode} onChange={(e) => onPassWindowModeChange?.(e.target.value)}>
              <option value="1day">1Day</option>
              <option value="12">12h</option>
              <option value="24">24h</option>
              <option value="48">48h</option>
              <option value="72">72h</option>
            </select>
          </label>
          {isDay ? (
            <label className="inline-control">
              Date
              <input type="date" value={passDate} onChange={(e) => onPassDateChange?.(e.target.value)} />
            </label>
          ) : null}
          <button className="button compact" type="button" onClick={onCopyPassText}>Text Copy</button>
          <span className="muted small">Ops: timer schedule / Radar: plot select</span>
          <span className="muted small">{predictionHorizonLabel(passWindowMode, horizonHours, passDate)}</span>
        </div>
      </div>
      {passes.length === 0 ? (
        <p className="muted">No visible pass in the selected prediction window.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ops</th>
              <th>Radar</th>
              <th>AOS</th>
              <th>MaxEL Time</th>
              <th>LOS</th>
              <th>MaxEL</th>
              <th>Range@MaxEL</th>
            </tr>
          </thead>
          <tbody>
            {passes.map((pass, i) => {
              const radarSelected = selectedSet.has(i);
              const operationKey = passStableKey(pass);
              const matchedOperationKey = findOperationKeyForPass(pass, selectedOperationPassKeys, operationPassRegistry);
              const opsSelected = Boolean(matchedOperationKey);
              const rowClass = [radarSelected ? "selected-pass-row" : "clickable-pass-row", opsSelected ? "operation-pass-row" : ""].filter(Boolean).join(" ");
              return (
                <tr key={i} className={rowClass} onClick={() => onSelectPass?.(i)}>
                  <td>
                    <button
                      type="button"
                      className={opsSelected ? "mini-pill selected" : "mini-pill"}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectOperationPass?.(matchedOperationKey || operationKey, pass, i);
                      }}
                      title={opsSelected ? "Remove this pass from the operation schedule" : "Add this pass to the operation schedule"}
                    >
                      {opsSelected ? "OPS" : "SET"}
                    </button>
                  </td>
                  <td>{radarSelected ? "PLOT" : `#${i + 1}`}</td>
                  <td>{formatIsoInZone(pass.aos, timeZone)}</td>
                  <td>{formatIsoInZone(pass.maxElTime, timeZone)}</td>
                  <td>{formatIsoInZone(pass.los, timeZone)}</td>
                  <td>{pass.maxElDeg.toFixed(1)}°</td>
                  <td>{(pass.rangeAtMaxElKm ?? pass.minRangeKm).toFixed(0)} km</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}


function formatPassBrief(pass, timeZone) {
  if (!pass) return { aos: "--", max: "--", los: "--", maxEl: "--", range: "--" };
  return {
    aos: formatIsoInZone(pass.aos, timeZone),
    max: formatIsoInZone(pass.maxElTime, timeZone),
    los: formatIsoInZone(pass.los, timeZone),
    maxEl: `${pass.maxElDeg.toFixed(1)}°`,
    range: `${(pass.rangeAtMaxElKm ?? pass.minRangeKm).toFixed(0)} km`,
  };
}

function passStableKey(pass) {
  if (!pass?.aos || !pass?.los) return "";
  const aosMinute = Math.round(pass.aos.getTime() / 60000);
  const losMinute = Math.round(pass.los.getTime() / 60000);
  return [aosMinute, losMinute].join(":");
}

function operationPassMatches(pass, operationKey, registryItem = null) {
  if (!pass) return false;
  if (operationKey && operationKey === passStableKey(pass)) return true;
  const snapshot = registryItem?.pass ? revivePassSnapshot(registryItem.pass) : null;
  if (!snapshot) return false;
  const aosDiff = Math.abs(snapshot.aos.getTime() - pass.aos.getTime());
  const losDiff = Math.abs(snapshot.los.getTime() - pass.los.getTime());
  return aosDiff <= 90_000 && losDiff <= 90_000;
}

function findOperationKeyForPass(pass, operationPassKeys = [], operationPassRegistry = {}) {
  for (const key of operationPassKeys) {
    if (operationPassMatches(pass, key, operationPassRegistry[key])) return key;
  }
  return null;
}

function passToSnapshot(pass) {
  if (!pass) return null;
  return {
    aos: pass.aos?.toISOString?.() || null,
    los: pass.los?.toISOString?.() || null,
    maxElTime: pass.maxElTime?.toISOString?.() || null,
    maxElDeg: safeNumber(pass.maxElDeg, 0),
    minRangeKm: safeNumber(pass.minRangeKm, 0),
    rangeAtMaxElKm: safeNumber(pass.rangeAtMaxElKm ?? pass.minRangeKm, 0),
    commandAos: pass.commandAos?.toISOString?.() || null,
    commandLos: pass.commandLos?.toISOString?.() || null,
  };
}

function revivePassSnapshot(snapshot) {
  if (!snapshot?.aos || !snapshot?.los) return null;
  return {
    aos: new Date(snapshot.aos),
    los: new Date(snapshot.los),
    maxElTime: snapshot.maxElTime ? new Date(snapshot.maxElTime) : new Date(snapshot.aos),
    maxElDeg: safeNumber(snapshot.maxElDeg, 0),
    minRangeKm: safeNumber(snapshot.minRangeKm, snapshot.rangeAtMaxElKm ?? 0),
    rangeAtMaxElKm: safeNumber(snapshot.rangeAtMaxElKm, snapshot.minRangeKm ?? 0),
    commandAos: snapshot.commandAos ? new Date(snapshot.commandAos) : null,
    commandLos: snapshot.commandLos ? new Date(snapshot.commandLos) : null,
  };
}

function NextPassMini({ pass, timeZone, inPass, title = null }) {
  const brief = formatPassBrief(pass, timeZone);
  return (
    <div className="radar-pass-summary">
      <div className="radar-pass-summary-head">
        <span>{title || (inPass ? "Current Pass" : "Next Visible Pass")}</span>
        <span className={inPass ? "status-pill ok" : "status-pill"}>{inPass ? "IN PASS" : "STANDBY"}</span>
      </div>
      <div className="radar-pass-mini-grid">
        <DataCard label="AOS" value={brief.aos} />
        <DataCard label="MaxEL" value={brief.max} />
        <DataCard label="LOS" value={brief.los} />
        <DataCard label="MaxEL Angle" value={brief.maxEl} />
        <DataCard label="Range@MaxEL" value={brief.range} />
      </div>
    </div>
  );
}

function SatelliteDisplayPanel({ satellites, visibleSatIds, onToggle, onSetAllVisible }) {
  return (
    <div className="sat-display-panel static-sat-display-panel">
      <div className="sat-display-head">
        <span>Display Satellites</span>
        <button className="mini-link" onClick={() => onSetAllVisible(true)}>all</button>
        <button className="mini-link" onClick={() => onSetAllVisible(false)}>none</button>
      </div>
      <div className="sat-check-list">
        {satellites.map((sat) => (
          <label key={sat.id} className="sat-check-item">
            <input type="checkbox" checked={visibleSatIds.includes(sat.id)} onChange={() => onToggle(sat.id)} />
            <span className="sat-color-dot" style={{ background: sat.color }} />
            <span>{sat.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function OperationTargetPanel({
  selectedSat,
  satellites,
  onSelectedSatChange,
  selectedStation,
  stations,
  onSelectedStationChange,
  visibleSatIds,
  onToggleVisibleSatellite,
  onSetAllVisible,
  onOpenSetup,
}) {
  return (
    <section className="panel operation-target-panel">
      <div className="operation-target-head">
        <div>
          <h2>Tracking / Display</h2>
          <p className="muted small">運用中に頻繁に触る追尾衛星・地上局・地図表示衛星だけをここで切り替えます。設定の正本はYAMLです。</p>
        </div>
        <button className="button compact setup-button" onClick={onOpenSetup}>YAML Setup / TLE Fetch</button>
      </div>
      <div className="operation-target-grid">
        <label>
          Tracking Satellite
          <select value={selectedSat?.id ?? ""} onChange={(event) => onSelectedSatChange(event.target.value)}>
            {satellites.map((sat) => <option key={sat.id} value={sat.id}>{sat.name}</option>)}
          </select>
        </label>
        <label>
          Ground Station
          <select value={selectedStation?.id ?? ""} onChange={(event) => onSelectedStationChange(event.target.value)}>
            {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
          </select>
        </label>
        <SatelliteDisplayPanel satellites={satellites} visibleSatIds={visibleSatIds} onToggle={onToggleVisibleSatellite} onSetAllVisible={onSetAllVisible} />
      </div>
    </section>
  );
}

function ViewModeSelector({ viewMode, onChange }) {
  return (
    <div className="view-mode-row">
      <span className="muted small">Upper view</span>
      <button className={viewMode === "split" ? "button compact primary" : "button compact"} onClick={() => onChange("split")}>Split</button>
      <button className={viewMode === "radar" ? "button compact primary" : "button compact"} onClick={() => onChange("radar")}>Radar focus</button>
      <button className={viewMode === "map" ? "button compact primary" : "button compact"} onClick={() => onChange("map")}>Map focus</button>
    </div>
  );
}



function MissionStatusBar({ items = [] }) {
  return (
    <div className="mission-status-strip" aria-label="Mission setup status">
      {items.map((item) => (
        <div key={item.label} className={`mission-status-item ${item.state || "neutral"}`}>
          <span className="mission-status-label">{item.label}</span>
          <strong>{item.value}</strong>
          {item.hint ? <small>{item.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}

function SetupStatusBar({ tleSourceCount, satelliteCount, stationCount, selectedSatName, selectedStationName, tleFetchStatus }) {
  const state = tleFetchStatus?.state || (tleSourceCount ? "not_fetched" : "not_required");
  const label = state === "fetched"
    ? `FETCHED ${tleFetchStatus?.success ?? 0}/${tleFetchStatus?.sourceCount ?? tleSourceCount}`
    : state === "fetching"
      ? `FETCHING 0/${tleFetchStatus?.sourceCount ?? tleSourceCount}`
      : state === "failed"
        ? `FETCH FAILED ${tleFetchStatus?.failed ?? 0}`
        : tleSourceCount
          ? `NEEDS FETCH ${tleSourceCount}`
          : "DIRECT TLE / NO URL";
  const tone = state === "fetched" ? "ok" : state === "fetching" ? "busy" : state === "failed" ? "ng" : (tleSourceCount ? "warn" : "ok");
  const updated = tleFetchStatus?.timestamp ? new Date(tleFetchStatus.timestamp) : null;
  return (
    <div className="setup-status-bar" aria-label="YAML setup status">
      <div className="setup-status-item ok"><span>YAML</span><strong>EDITOR READY</strong></div>
      <div className={`setup-status-item ${tone}`}><span>TLE URL</span><strong>{label}</strong></div>
      <div className="setup-status-item"><span>Satellites</span><strong>{satelliteCount}</strong></div>
      <div className="setup-status-item"><span>Ground Stations</span><strong>{stationCount}</strong></div>
      <div className="setup-status-item wide"><span>Tracking</span><strong>{selectedSatName || "--"}</strong></div>
      <div className="setup-status-item wide"><span>GS</span><strong>{selectedStationName || "--"}</strong></div>
      {updated ? <div className="setup-status-item"><span>Last Fetch</span><strong>{updated.toLocaleTimeString()}</strong></div> : null}
    </div>
  );
}

function SettingsDialog({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="settings-modal-window" role="dialog" aria-modal="true" aria-label="Mission setup and YAML settings">
        <div className="settings-modal-header">
          <div>
            <h2>YAML Setup / TLE Fetch</h2>
            <p className="muted small">VSCode風に、Quick Add / YAML Editor / Advanced Settings を分離しています。通常はYAML一括設定 → 必要ならTLE Fetch の順で操作します。</p>
          </div>
          <button className="button compact" onClick={onClose}>Close</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function MissionSetupPanel({
  quickTleText,
  onQuickTleTextChange,
  onAddQuickTle,
  onAddAndFetchQuickTle,
  onFetchTleSources,
  tleSourceCount,
  satelliteCount,
  stationCount,
  selectedSatName,
  selectedStationName,
  tleFetchStatus,
  exporting,
  onImportConfigFile,
  onDownloadTemplate,
  onDownloadTleSourceTemplate,
  onExportYaml,
  onClearLocalConfig,
  onOpenGitHubRepository,
  configMessage,
  configText,
  onConfigTextChange,
  onApplyConfigText,
  onSyncEditorFromCurrent,
  onApplyRecommendedMap,
  recommendedMaps,
  onUseBundledMap,
  onImportMapBackgroundFile,
  onImportRadarBackgroundFile,
  onImportSkylineCsvFile,
  skylineProfile,
  orbitTrackColorMode,
  onOrbitTrackColorModeChange,
  commandElevationDeg,
  onCommandElevationDegChange,
  missionStatusItems = [],
}) {
  const fetchRequired = tleSourceCount > 0 && missionStatusItems.some((item) => item.label === "TLE" && item.state === "warn");
  return (
    <section className="setup-workbench">
      <MissionStatusBar items={missionStatusItems} />
      {fetchRequired ? (
        <div className="setup-fetch-callout">
          <strong>TLE URL sources detected.</strong> YAML内の <code>tle_sources</code> はURLリストです。設定を反映したあと、<b>Fetch URL TLEs</b> を押して衛星TLEを取得してください。
        </div>
      ) : null}
      <SetupStatusBar
        tleSourceCount={tleSourceCount}
        satelliteCount={satelliteCount}
        stationCount={stationCount}
        selectedSatName={selectedSatName}
        selectedStationName={selectedStationName}
        tleFetchStatus={tleFetchStatus}
      />
      <section className="setup-row setup-quick-row">
        <div className="setup-section-head">
          <div>
            <div className="setup-section-kicker">Quick Add / temporary satellite import</div>
            <h3>Paste name@URL list or 3-line TLE</h3>
            <p className="muted small">通常はYAML一括設定を使います。ここは、運用中に一時的にTLE URLや3行TLEを追加したい場合の補助欄です。</p>
          </div>
          <div className="mission-status-chip">TLE sources: <strong>{tleSourceCount}</strong></div>
        </div>
        <div className="setup-quick-grid">
          <textarea
            className="setup-quick-textarea mono"
            spellCheck="false"
            value={quickTleText}
            onChange={(event) => onQuickTleTextChange(event.target.value)}
            placeholder={'ISS (ZARYA)@https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE\n\nまたは\nSAT NAME\n1 .....\n2 .....'}
          />
          <div className="setup-quick-actions">
            <button className="button primary" onClick={onAddAndFetchQuickTle} disabled={exporting}>Fetch Now & Add</button>
            <button className="button" onClick={onAddQuickTle}>Insert into YAML only</button>
          </div>
        </div>
      </section>

      <section className="setup-row setup-editor-row">
        <div className="setup-section-head editor-head">
          <div>
            <div className="setup-section-kicker">YAML editor / operation source of truth</div>
            <h3>Mission configuration</h3>
            <p className="muted small">運用設定の正本です。tle_sources を含むYAMLを適用した後は、右側の Fetch URL TLEs を実行してください。</p>
          </div>
          <div className="setup-toolbar">
            <label className="button file-button primary">
              Import YAML(s)
              <input type="file" multiple accept=".yaml,.yml,.json,application/x-yaml,application/json" onChange={onImportConfigFile} />
            </label>
            <button className="button primary" onClick={onApplyConfigText}>Apply YAML</button>
            <button className="button fetch-button" onClick={onFetchTleSources} disabled={exporting || !tleSourceCount}>Fetch URL TLEs</button>
            <button className="button" onClick={onSyncEditorFromCurrent}>Sync from Current State</button>
          </div>
        </div>
        <div className={tleSourceCount ? "fetch-guidance active" : "fetch-guidance"}>
          {tleSourceCount
            ? `TLE URL sources detected: ${tleSourceCount}. Apply YAML の後、Fetch URL TLEs で衛星リストを更新します。`
            : "TLE本文を satellites[].tle に書く場合は、YAML適用だけで衛星が登録されます。URL型は tle_sources を使います。"}
        </div>
        <textarea
          className="setup-yaml-editor mono"
          spellCheck="false"
          value={configText}
          onChange={(event) => onConfigTextChange(event.target.value)}
          aria-label="YAML configuration editor"
        />
        <div className="setup-message-line">{configMessage}</div>
      </section>

      <section className="setup-row setup-bottom-row">
        <section className="setup-subpanel">
          <div className="setup-section-kicker">Advanced display settings</div>
          <h3>Map / Radar / Track</h3>
          <div className="setup-form-grid">
            <label>
              Map Preset
              <select defaultValue="" onChange={(event) => onApplyRecommendedMap(event.target.value)}>
                <option value="" disabled>Recommended map URL</option>
                {recommendedMaps.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
            </label>
            <label>
              Orbit Track Color
              <select value={orbitTrackColorMode} onChange={(event) => onOrbitTrackColorModeChange(event.target.value)}>
                <option value="sunlight">Sunlight / eclipse</option>
                <option value="satellite">Satellite color</option>
              </select>
            </label>
            <label>
              Command AOS/LOS Elevation [deg]
              <input
                type="number"
                step="0.1"
                value={commandElevationDeg}
                onChange={(event) => onCommandElevationDegChange?.(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="setup-button-grid">
            <button className="button" onClick={onUseBundledMap}>Bundled Map</button>
            <label className="button file-button">
              Upload Map Image
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onImportMapBackgroundFile} />
            </label>
            <label className="button file-button">
              Upload Skyline
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onImportRadarBackgroundFile} />
            </label>
            <label className="button file-button">
              Upload Skyline CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onImportSkylineCsvFile} />
            </label>
            {skylineProfile?.rows?.length ? <span className="status-pill ok skyline-csv-status">Skyline CSV {skylineProfile.rows.length} pts</span> : null}
          </div>
        </section>

        <section className="setup-subpanel">
          <div className="setup-section-kicker">Other tools</div>
          <h3>Templates / Export / Privacy</h3>
          <div className="setup-button-grid tools-grid">
            <button className="button" onClick={onExportYaml}>Export Current YAML</button>
            <button className="button" onClick={onDownloadTemplate}>Download Template</button>
            <button className="button" onClick={onDownloadTleSourceTemplate}>Download URL Template</button>
            <button className="button github-button" onClick={onOpenGitHubRepository}>GitHub</button>
            <button className="button danger" onClick={onClearLocalConfig}>Clear Browser Config</button>
          </div>
          <div className="app-tools-box compact-privacy-box">
            <div className="muted tiny">Privacy / data flow</div>
            <p className="privacy-note">YAML/ローカル画像はブラウザ内で処理されます。外部通信はTLE取得URL・外部地図/背景画像URLへのGETリクエストが中心です。</p>
          </div>
        </section>
      </section>
    </section>
  );
}

function App() {
  const [initialConfig] = useState(() => {
    try {
      const saved = CONFIG_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
      return saved ? normalizeConfig(yaml.load(saved)) : normalizeConfig(DEFAULT_RAW_CONFIG);
    } catch {
      return normalizeConfig(DEFAULT_RAW_CONFIG);
    }
  });

  const [appConfig, setAppConfig] = useState(initialConfig.app);
  const [opsConfig, setOpsConfig] = useState(initialConfig.ops);
  const [mapConfig, setMapConfig] = useState(initialConfig.map);
  const [radarConfig, setRadarConfig] = useState(initialConfig.radar);
  const [orbitTrackConfig, setOrbitTrackConfig] = useState(initialConfig.orbitTrack);
  const [tleSources, setTleSources] = useState(initialConfig.tleSources || []);
  const [satellites, setSatellites] = useState(initialConfig.satellites);
  const [stations, setStations] = useState(initialConfig.groundStations);
  const [selectedSatId, setSelectedSatId] = useState(initialConfig.satellites[0]?.id ?? "");
  const [selectedStationId, setSelectedStationId] = useState(initialConfig.groundStations[0]?.id ?? "");
  const [visibleSatIds, setVisibleSatIds] = useState(() => initialConfig.satellites.map((sat) => sat.id));
  const [running, setRunning] = useState(true);
  const [clockNow, setClockNow] = useState(new Date());
  const [timeOffsetMinutes, setTimeOffsetMinutes] = useState(0);
  const now = useMemo(() => new Date(clockNow.getTime() + safeNumber(timeOffsetMinutes, 0) * 60000), [clockNow, timeOffsetMinutes]);
  const [configText, setConfigText] = useState(() => buildTemplateYaml());
  const [configMessage, setConfigMessage] = useState("YAMLでTLE・地上局・周波数・地図設定を一括管理します。");
  const [tleFetchStatus, setTleFetchStatus] = useState(() => ({
    state: initialConfig.tleSources?.length ? "not_fetched" : "not_required",
    sourceCount: initialConfig.tleSources?.length || 0,
    success: 0,
    failed: 0,
    timestamp: null,
    message: initialConfig.tleSources?.length ? "TLE URL sources are configured. Fetch is required." : "No URL fetch required.",
  }));
  const [quickTleText, setQuickTleText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState("split");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinnedPassIndices, setPinnedPassIndices] = useState([]);
  const [selectedOperationPassKeys, setSelectedOperationPassKeys] = useState([]);
  const [operationPassRegistry, setOperationPassRegistry] = useState({});
  const [skylineProfile, setSkylineProfile] = useState(null);
  const [passWindowMode, setPassWindowMode] = useState("24");
  const [passDate, setPassDate] = useState(() => formatYmdInZone(new Date(), initialConfig.ops.timezone || "Asia/Tokyo"));
  const [csvDate, setCsvDate] = useState(() => formatYmdInZone(new Date(), initialConfig.ops.timezone || "Asia/Tokyo"));

  const selectedSat = satellites.find((s) => s.id === selectedSatId) ?? satellites[0];
  const selectedStation = stations.find((g) => g.id === selectedStationId) ?? stations[0];
  const displayedSatellites = satellites.filter((sat) => visibleSatIds.includes(sat.id));

  const currentConfig = useMemo(
    () => exportableConfig(appConfig, opsConfig, mapConfig, radarConfig, orbitTrackConfig, tleSources, selectedSat, selectedStation, satellites, stations),
    [appConfig, opsConfig, mapConfig, radarConfig, orbitTrackConfig, tleSources, selectedSat, selectedStation, satellites, stations]
  );

  useEffect(() => {
    localStorage.setItem("web-orbitron:config-yaml-v14", dumpYaml(currentConfig));
  }, [currentConfig]);

  useEffect(() => {
    if (!running) return undefined;
    const intervalMs = Math.max(0.2, safeNumber(appConfig.refreshSec, 1)) * 1000;
    const id = setInterval(() => setClockNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [running, appConfig.refreshSec]);

  useEffect(() => {
    setVisibleSatIds((prev) => {
      const existing = new Set(satellites.map((sat) => sat.id));
      const retained = prev.filter((id) => existing.has(id));
      const added = satellites.map((sat) => sat.id).filter((id) => !prev.includes(id));
      return [...retained, ...added];
    });
  }, [satellites]);

  useEffect(() => {
    setPinnedPassIndices([]);
  }, [selectedSatId, selectedStationId, passWindowMode, passDate]);

  const selectedState = selectedSat ? computeSatState(selectedSat, now) : null;
  const look = selectedState && selectedStation ? computeLookAngles(selectedState, selectedStation) : null;
  const currentObservation = selectedSat && selectedStation ? computeObservation(selectedSat, selectedStation, now, 1) : null;
  const currentEclipse = selectedState ? computeEclipseStatus(selectedState, now) : { mode: "UNKNOWN", sunlit: false };
  const currentSunlit = currentEclipse.sunlit;
  const groundLight = selectedStation ? computeGroundLightStatus(selectedStation, now) : { mode: "--", solarElevationDeg: null };
  const predictionTimeKey = Math.floor(now.getTime() / 60000);
  const effectivePredictionHorizonHours = predictionHorizonHoursFromMode(now, opsConfig.timezone || "Asia/Tokyo", passWindowMode);
  const predictionStartDate = useMemo(() => predictionStartDateFromMode(now, opsConfig.timezone || "Asia/Tokyo", passWindowMode, passDate), [predictionTimeKey, opsConfig.timezone, passWindowMode, passDate]);
  const passes = useMemo(() => {
    if (!selectedSat || !selectedStation) return [];
    return predictPasses(selectedSat, selectedStation, predictionStartDate, effectivePredictionHorizonHours, safeNumber(appConfig.predictionStepSec, 30), opsConfig.commandElevationDeg);
  }, [selectedSat, selectedStation, predictionStartDate, effectivePredictionHorizonHours, appConfig.predictionStepSec, opsConfig.commandElevationDeg]);

  const activePassIndex = passes.findIndex((pass) => now >= pass.aos && now <= pass.los);
  const activePass = activePassIndex >= 0 ? passes[activePassIndex] : null;
  const autoRadarPass = activePass || passes.find((pass) => pass.aos > now) || passes[0];
  const selectedRadarPasses = pinnedPassIndices.map((index) => ({ index, pass: passes[index] })).filter((item) => Boolean(item.pass));
  const radarPassItems = selectedRadarPasses.length
    ? selectedRadarPasses.map((item) => ({ ...item, mode: "selected" }))
    : (autoRadarPass ? [{ index: activePass ? activePassIndex : null, pass: autoRadarPass, mode: activePass ? "current" : "auto" }] : []);
  const radarPassSeries = useMemo(() => radarPassItems.map((item, seriesIndex) => ({
    key: `${item.mode}-${item.index ?? "auto"}-${item.pass.aos.getTime()}`,
    index: item.index,
    mode: item.mode,
    label: item.index !== null && item.index !== undefined ? `#${item.index + 1}` : (item.mode === "current" ? "CURRENT" : "NEXT"),
    pass: item.pass,
    rows: sampleRadarPath(selectedSat, selectedStation, item.pass, 20),
    seriesIndex,
  })), [selectedSat, selectedStation, radarPassItems]);
  const radarSatMarkers = useMemo(() => {
    if (!selectedStation) return [];
    return displayedSatellites
      .map((sat) => {
        const obs = computeObservation(sat, selectedStation, now, 1);
        if (!obs) return null;
        return { id: sat.id, name: sat.name, color: sat.color, isTarget: sat.id === selectedSat?.id, ...obs };
      })
      .filter(Boolean);
  }, [displayedSatellites, selectedStation, selectedSat, now]);
  const radarPassLegendItems = radarPassSeries.map((series) => `${series.label} AOS ${formatIsoInZone(series.pass.aos, opsConfig.timezone || "Asia/Tokyo")} / MaxEL ${series.pass.maxElDeg.toFixed(1)} deg`);
  const operationPassEntries = selectedOperationPassKeys
    .map((key) => {
      const registryItem = operationPassRegistry[key];
      const visibleIndex = passes.findIndex((pass) => operationPassMatches(pass, key, registryItem));
      const visiblePass = visibleIndex >= 0 ? passes[visibleIndex] : null;
      const snapshotPass = registryItem?.pass ? revivePassSnapshot(registryItem.pass) : null;
      const pass = visiblePass || snapshotPass;
      if (!pass) return null;
      if (registryItem?.satId && registryItem.satId !== selectedSatId) return null;
      if (registryItem?.stationId && registryItem.stationId !== selectedStationId) return null;
      return { key, index: visibleIndex >= 0 ? visibleIndex : registryItem?.displayIndex ?? -1, pass, fromVisibleTable: visibleIndex >= 0 };
    })
    .filter(Boolean)
    .sort((a, b) => a.pass.aos.getTime() - b.pass.aos.getTime());
  const operationTimerEntry = operationPassEntries.find((entry) => now <= entry.pass.los) || operationPassEntries[operationPassEntries.length - 1] || null;
  const passTimer = buildPassTimer(
    passes,
    now,
    opsConfig.timezone || "Asia/Tokyo",
    operationTimerEntry?.pass || null,
    operationTimerEntry ? `OPS #${operationTimerEntry.index >= 0 ? operationTimerEntry.index + 1 : "saved"}/${operationPassEntries.length}` : null
  );
  const commandPassTimer = buildCommandPassTimer(passTimer.targetPass, now, opsConfig.timezone || "Asia/Tokyo", opsConfig.commandElevationDeg);

  const tleFetchNeedsAction = tleSources.length > 0 && tleFetchStatus.state !== "fetched";
  const missionStatusItems = [
    {
      label: "YAML",
      value: configText.trim() ? "loaded" : "empty",
      state: configText.trim() ? "ok" : "warn",
      hint: configText.trim() ? "editor ready" : "import or write YAML",
    },
    {
      label: "TLE",
      value: tleSources.length
        ? (tleFetchNeedsAction ? "fetch required" : `fetched ${tleFetchStatus.success || satellites.length}/${tleSources.length}`)
        : `${satellites.length} direct`,
      state: tleSources.length ? (tleFetchNeedsAction ? "warn" : "ok") : (satellites.length ? "ok" : "warn"),
      hint: tleSources.length ? "URL sources" : "satellites[].tle",
    },
    {
      label: "TRACK",
      value: selectedSat?.name || "not selected",
      state: selectedSat ? "ok" : "warn",
    },
    {
      label: "DISPLAY",
      value: `${displayedSatellites.length}/${satellites.length}`,
      state: displayedSatellites.length ? "ok" : "warn",
      hint: "visible on map/radar",
    },
    {
      label: "OPS",
      value: `${selectedOperationPassKeys.length} reserved`,
      state: selectedOperationPassKeys.length ? "ok" : "neutral",
    },
    {
      label: "CMD EL",
      value: `${safeNumber(opsConfig.commandElevationDeg, 0).toFixed(1)} deg`,
      state: "neutral",
      hint: "command AOS/LOS",
    },
    {
      label: "CSV",
      value: selectedSat && selectedStation ? "ready" : "not ready",
      state: selectedSat && selectedStation ? "ok" : "warn",
      hint: csvDate,
    },
  ];

  function applyNormalizedConfig(config) {
    setAppConfig(config.app);
    setOpsConfig(config.ops);
    setMapConfig(config.map);
    setRadarConfig(config.radar);
    setOrbitTrackConfig(config.orbitTrack);
    setTleSources(config.tleSources || []);
    setSatellites(config.satellites);
    setStations(config.groundStations);
    setSelectedSatId(config.satellites[0]?.id ?? "");
    setSelectedStationId(config.groundStations[0]?.id ?? "");
    setVisibleSatIds(config.satellites.map((sat) => sat.id));
    setCsvDate(formatYmdInZone(new Date(), config.ops.timezone || "Asia/Tokyo"));
    const text = dumpYaml(exportableConfig(config.app, config.ops, config.map, config.radar, config.orbitTrack, config.tleSources || [], config.satellites[0], config.groundStations[0], config.satellites, config.groundStations));
    setConfigText(text);
    const sourceCount = config.tleSources?.length || 0;
    setTleFetchStatus({
      state: sourceCount ? "not_fetched" : "not_required",
      sourceCount,
      success: 0,
      failed: 0,
      timestamp: null,
      message: sourceCount ? "YAML contains TLE URL sources. Fetch is required." : "No URL fetch required.",
    });
    setConfigMessage(sourceCount
      ? `設定を適用しました。TLE URL sources=${sourceCount}。次に Fetch URL TLEs を押してください。`
      : "設定を適用しました。TLE本文またはデフォルトTLEを使用します。");
  }

  function applyConfigText() {
    try {
      const parsed = parseConfigText(configText);
      applyNormalizedConfig(normalizeConfig(parsed));
    } catch (error) {
      setConfigMessage(`設定の読み込みに失敗しました: ${error.message}`);
    }
  }

  function exportYaml() {
    downloadText("web-orbitron-config.yaml", dumpYaml(currentConfig), "application/x-yaml");
  }

  function clearLocalConfig() {
    const ok = window.confirm(
      "ブラウザ内に保存された SatPass Ops Console の設定を削除します。現在の画面表示は維持されますが、再読み込み後はデフォルト設定に戻ります。続行しますか？"
    );
    if (!ok) return;
    CONFIG_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    setConfigMessage("ブラウザ内の保存設定を削除しました。現在の画面状態を残したい場合は Export Current YAML で保存してください。");
  }

  function openGitHubRepository() {
    window.open(GITHUB_REPOSITORY_URL, "_blank", "noopener,noreferrer");
  }

  function downloadTemplate() {
    downloadText("config_example.yaml", buildTemplateYaml(), "application/x-yaml");
  }

  function downloadTleSourceTemplate() {
    downloadText("tle_sources_example.yaml", `# TLE URL source example\n# name@url 形式で1行1件を指定します。取得は Fetch URL TLEs / Fetch Now & Add で実行します。\ntle_sources: |\n${DEFAULT_TLE_SOURCES_TEXT.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#")).map((line) => `  ${line}`).join("\n")}\n`, "application/x-yaml");
  }

  function loadDefaultTleSources() {
    const sources = normalizeTleSources(DEFAULT_TLE_SOURCES_TEXT);
    setTleSources(sources);
    setConfigText((prevText) => {
      try {
        const current = parseConfigText(prevText || buildTemplateYaml());
        return dumpYaml({ ...(current && typeof current === "object" ? current : {}), tle_sources: sources.map((source) => ({ name: source.name, url: source.url })) });
      } catch {
        return dumpYaml({ tle_sources: sources.map((source) => ({ name: source.name, url: source.url })) });
      }
    });
    setConfigMessage(`サンプルTLE取得元を読み込みました。source_count=${sources.length}`);
  }

  function syncEditorFromCurrent() {
    setConfigText(dumpYaml(currentConfig));
    setConfigMessage("現在の設定をYAMLエディタへ反映しました。");
  }

  async function importConfigFile(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const fragments = await Promise.all(files.map(async (file) => parseConfigText(await file.text(), file.name)));
      const merged = fragments.length === 1 ? fragments[0] : mergeConfigFragments(fragments);
      applyNormalizedConfig(normalizeConfig(merged));
      setConfigMessage(files.length === 1 ? `設定ファイルを読み込みました: ${files[0].name}。tle_sources がある場合は Fetch URL TLEs を実行してください。` : `${files.length} 個の分割YAML/JSONを読み込みました。tle_sources がある場合は Fetch URL TLEs を実行してください。`);
    } catch (error) {
      setConfigMessage(`設定ファイルの読み込みに失敗しました: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  function importMapBackgroundFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setMapConfig((prev) => ({
        ...prev,
        backgroundImageUrl: dataUrl,
        backgroundOpacity: prev.backgroundOpacity ?? 0.85,
        attribution: `Uploaded local image: ${file.name}`,
        showSyntheticLand: false,
      }));
      setConfigMessage(`地図背景画像を読み込みました: ${file.name}`);
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }


  function importRadarBackgroundFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setRadarConfig((prev) => ({
        ...prev,
        backgroundImageUrl: dataUrl,
        backgroundOpacity: prev.backgroundOpacity ?? 0.45,
        attribution: `Uploaded skyline image: ${file.name}`,
      }));
      setConfigMessage(`レーダーチャート背景画像を読み込みました: ${file.name}`);
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  }

  function importSkylineCsvFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseSkylineCsv(String(reader.result || ""));
        if (rows.length < 2) throw new Error("CSVから2点以上の方位角/仰角データを読み取れませんでした。");
        setSkylineProfile({ name: file.name, rows });
        setConfigMessage(`スカイラインCSVを読み込みました: ${file.name} / ${rows.length} points`);
      } catch (error) {
        setConfigMessage(`スカイラインCSVの読み込みに失敗しました: ${error.message}`);
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function useBundledMap() {
    setMapConfig((prev) => ({
      ...prev,
      backgroundImageUrl: "./assets/world_mercator_simple.svg",
      backgroundOpacity: 0.90,
      attribution: "Bundled simplified Mercator-style SVG",
      showSyntheticLand: false,
      projection: "mercator",
    }));
    setConfigMessage("同梱の簡易メルカトル地図を背景に設定しました。");
  }

  function applyRecommendedMap(mapId) {
    const preset = RECOMMENDED_MAPS.find((item) => item.id === mapId);
    if (!preset) return;
    setMapConfig((prev) => ({
      ...prev,
      backgroundImageUrl: preset.url,
      backgroundOpacity: preset.opacity,
      attribution: preset.attribution,
      showSyntheticLand: false,
      projection: preset.projection,
    }));
    setConfigMessage(`推奨地図を設定しました: ${preset.label}`);
  }

  function buildQuickTleConfigPatch(text) {
    const trimmed = safeString(text).trim();
    if (!trimmed) throw new Error("TLE URL または TLE ブロックを入力してください。");

    const sources = normalizeTleSources(trimmed);
    if (sources.length) return { sources, satellites: [], kind: "source" };

    try {
      const parsed = parseTleBlock(trimmed);
      return {
        sources: [],
        satellites: [{
          id: sanitizeId(parsed.name, `sat-${satellites.length + 1}`),
          name: parsed.name,
          line1: parsed.line1,
          line2: parsed.line2,
          color: SAT_COLORS[satellites.length % SAT_COLORS.length],
        }],
        kind: "tle",
      };
    } catch {
      const parsedConfig = parseConfigText(trimmed);
      const normalized = normalizeConfig(parsedConfig);
      const userDefinedTle = hasUserDefinedTle(parsedConfig);
      return {
        sources: normalized.tleSources || [],
        satellites: userDefinedTle ? normalized.satellites : [],
        kind: "yaml",
      };
    }
  }

  function mergeTleSources(prevSources, addedSources) {
    const next = [...prevSources];
    addedSources.forEach((source) => {
      if (!source?.url) return;
      const idx = next.findIndex((item) => item.id === source.id || item.url.toLowerCase() === source.url.toLowerCase());
      if (idx >= 0) next[idx] = { ...next[idx], ...source };
      else next.push(source);
    });
    return next;
  }

  function mergeSatellites(prevSats, addedSats) {
    const next = [...prevSats];
    addedSats.forEach((sat) => {
      if (!sat?.line1 || !sat?.line2) return;
      const idx = next.findIndex((item) => item.id === sat.id || item.name === sat.name || item.sourceUrl === sat.sourceUrl);
      if (idx >= 0) next[idx] = { ...next[idx], ...sat, color: next[idx].color || sat.color };
      else next.push({ ...sat, color: sat.color || SAT_COLORS[next.length % SAT_COLORS.length] });
    });
    return next;
  }

  function syncYamlAfterQuickTle(nextSources, nextSatellites) {
    const updated = exportableConfig(
      appConfig,
      opsConfig,
      mapConfig,
      radarConfig,
      orbitTrackConfig,
      nextSources,
      nextSatellites.find((sat) => sat.id === selectedSatId) || nextSatellites[0],
      selectedStation,
      nextSatellites,
      stations
    );
    setConfigText(dumpYaml(updated));
  }

  async function applyQuickTleInput({ fetchAfter = false } = {}) {
    try {
      const patch = buildQuickTleConfigPatch(quickTleText);
      const nextSources = mergeTleSources(tleSources, patch.sources);
      const nextSats = mergeSatellites(satellites, patch.satellites);

      setTleSources(nextSources);
      setSatellites(nextSats);
      if (patch.satellites[0]) setSelectedSatId(patch.satellites[0].id);
      setVisibleSatIds((prev) => Array.from(new Set([...prev, ...patch.satellites.map((sat) => sat.id)])));
      syncYamlAfterQuickTle(nextSources, nextSats);

      const sourceMessage = patch.sources.length ? `TLE source=${patch.sources.length}` : "";
      const satMessage = patch.satellites.length ? `TLE sat=${patch.satellites.length}` : "";
      setConfigMessage(`Quick Satellite Add をYAMLへ反映しました。${[sourceMessage, satMessage].filter(Boolean).join(", ") || "no item"}`);
      if (patch.sources.length) {
        setTleFetchStatus({
          state: "not_fetched",
          sourceCount: nextSources.length,
          success: 0,
          failed: 0,
          timestamp: null,
          message: "Quick Add inserted URL sources. Fetch is required unless Fetch now was selected.",
        });
      }

      if (fetchAfter) {
        if (!patch.sources.length) {
          setConfigMessage("TLE本体は追加済みです。URL取得対象はありません。");
          return;
        }
        await fetchTleSourceList(patch.sources, "Quick TLE");
      }
    } catch (error) {
      setConfigMessage(`Quick Satellite Add の取り込みに失敗しました: ${error.message}`);
    }
  }

  async function fetchTleSourceList(sources, label = "TLE URL") {
    const targetSources = Array.isArray(sources) ? sources : [];
    if (!targetSources.length) {
      setConfigMessage("TLE取得元が未設定です。tle_sources または satellites[].tle_url をYAMLに追加してください。");
      return;
    }
    setExporting(true);
    setTleFetchStatus({ state: "fetching", sourceCount: targetSources.length, success: 0, failed: 0, timestamp: null, message: `${label} fetching...` });
    setConfigMessage(`${label} から取得中です。source_count=${targetSources.length}`);
    try {
      const results = await Promise.allSettled(targetSources.map((source, index) => fetchSatelliteFromTleSource(source, index)));
      const fetched = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
      const failed = results.filter((result) => result.status === "rejected").map((result) => result.reason?.message || String(result.reason));
      if (!fetched.length) throw new Error(failed.join(" / ") || "全TLE取得に失敗しました。");

      setSatellites((prev) => mergeSatellites(prev, fetched));
      setVisibleSatIds((prevIds) => Array.from(new Set([...prevIds, ...fetched.map((item) => item.id)])));
      setSelectedSatId(fetched[0]?.id ?? selectedSatId);
      setTleFetchStatus({
        state: "fetched",
        sourceCount: targetSources.length,
        success: fetched.length,
        failed: failed.length,
        timestamp: new Date().toISOString(),
        message: failed.length ? failed.join(" / ") : "Fetch completed.",
      });
      setConfigMessage(`TLE取得完了: success=${fetched.length}, failed=${failed.length}${failed.length ? ` / ${failed.join(" / ")}` : ""}`);
    } catch (error) {
      setTleFetchStatus({ state: "failed", sourceCount: targetSources.length, success: 0, failed: targetSources.length, timestamp: new Date().toISOString(), message: error.message });
      setConfigMessage(`TLE取得に失敗しました: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }

  async function fetchTleSources() {
    await fetchTleSourceList(tleSources, "TLE URL");
  }

  function toggleVisibleSatellite(id) {
    setVisibleSatIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  }

  function setAllSatellitesVisible(visible) {
    setVisibleSatIds(visible ? satellites.map((sat) => sat.id) : []);
  }

  function toggleSelectedRadarPass(index) {
    setPinnedPassIndices((prev) => prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index].sort((a, b) => a - b));
  }

  function toggleOperationPass(passKey, pass = null, displayIndex = -1) {
    if (!passKey) return;
    setOperationPassRegistry((prev) => {
      if (prev[passKey]) {
        const next = { ...prev };
        delete next[passKey];
        return next;
      }
      return {
        ...prev,
        [passKey]: {
          key: passKey,
          satId: selectedSatId,
          stationId: selectedStationId,
          satName: selectedSat?.name || "",
          stationName: selectedStation?.name || "",
          displayIndex,
          pass: passToSnapshot(pass),
          reservedAt: new Date().toISOString(),
        },
      };
    });
    setSelectedOperationPassKeys((prev) => {
      if (prev.includes(passKey)) return prev.filter((key) => key !== passKey);
      const next = [...prev, passKey];
      return next.sort((a, b) => {
        const pa = a === passKey ? pass : (operationPassRegistry[a]?.pass ? revivePassSnapshot(operationPassRegistry[a].pass) : passes.find((item) => passStableKey(item) === a));
        const pb = b === passKey ? pass : (operationPassRegistry[b]?.pass ? revivePassSnapshot(operationPassRegistry[b].pass) : passes.find((item) => passStableKey(item) === b));
        return (pa?.aos?.getTime?.() || 0) - (pb?.aos?.getTime?.() || 0);
      });
    });
  }

  async function copyPassTableText() {
    const text = buildPassCopyText(passes, opsConfig.timezone || "Asia/Tokyo", selectedOperationPassKeys, operationPassRegistry);
    try {
      await navigator.clipboard.writeText(text);
      setConfigMessage("パス予測テキストをクリップボードにコピーしました。");
    } catch {
      downloadText("pass_prediction.txt", text, "text/plain");
      setConfigMessage("クリップボード書き込みに失敗したため、pass_prediction.txt として出力しました。");
    }
  }

  async function exportPassCsvZip() {
    if (!selectedSat || !selectedStation) return;
    setExporting(true);
    setConfigMessage("パス別 Doppler CSV ZIP を生成中です。1秒刻みなので数秒かかる場合があります。");
    try {
      const { blob, filename, passCount } = await buildDopplerZip({ appConfig, opsConfig, mapConfig, radarConfig, orbitTrackConfig, sat: selectedSat, station: selectedStation, observationDateOverride: csvDate });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setConfigMessage(`Doppler CSV ZIP を出力しました。date=${csvDate}, pass_count=${passCount}`);
    } catch (error) {
      setConfigMessage(`Doppler CSV ZIP の生成に失敗しました: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar compact-topbar">
        <div>
          <h1>{appConfig.title}</h1>
          <p>TLEと地上局データから、衛星可視性・方位仰角・日照/日陰・地上軌跡・Doppler CSV計画値を表示/出力します。</p>
        </div>
        <div className="top-actions runtime-actions">
          <button className="button primary" onClick={() => setRunning((v) => !v)}>{running ? "Pause" : "Run"}</button>
          <button className="button" onClick={() => setClockNow(new Date())}>Now</button>
          <button className="button setup-button" onClick={() => setSettingsOpen(true)}>YAML Setup / TLE Fetch</button>
          <button className="button github-button" onClick={openGitHubRepository}>GitHub</button>
          <label className="offset-control">Offset min<input type="number" step="1" value={timeOffsetMinutes} onChange={(e) => setTimeOffsetMinutes(e.target.value)} /></label>
          <button className="button" onClick={() => setTimeOffsetMinutes(0)}>Offset 0</button>
        </div>
      </header>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <MissionSetupPanel
          quickTleText={quickTleText}
          onQuickTleTextChange={setQuickTleText}
          onAddQuickTle={() => applyQuickTleInput({ fetchAfter: false })}
          onAddAndFetchQuickTle={() => applyQuickTleInput({ fetchAfter: true })}
          onFetchTleSources={fetchTleSources}
          tleSourceCount={tleSources.length}
          satelliteCount={satellites.length}
          stationCount={stations.length}
          selectedSatName={selectedSat?.name}
          selectedStationName={selectedStation?.name}
          tleFetchStatus={tleFetchStatus}
          exporting={exporting}
          onImportConfigFile={importConfigFile}
          onDownloadTemplate={downloadTemplate}
          onDownloadTleSourceTemplate={downloadTleSourceTemplate}
          onExportYaml={exportYaml}
          onClearLocalConfig={clearLocalConfig}
          onOpenGitHubRepository={openGitHubRepository}
          configMessage={configMessage}
          configText={configText}
          onConfigTextChange={setConfigText}
          onApplyConfigText={applyConfigText}
          onSyncEditorFromCurrent={syncEditorFromCurrent}
          onApplyRecommendedMap={applyRecommendedMap}
          recommendedMaps={RECOMMENDED_MAPS}
          onUseBundledMap={useBundledMap}
          onImportMapBackgroundFile={importMapBackgroundFile}
          onImportRadarBackgroundFile={importRadarBackgroundFile}
          onImportSkylineCsvFile={importSkylineCsvFile}
          skylineProfile={skylineProfile}
          orbitTrackColorMode={orbitTrackConfig.colorMode}
          onOrbitTrackColorModeChange={(value) => setOrbitTrackConfig((prev) => ({ ...prev, colorMode: value }))}
          commandElevationDeg={opsConfig.commandElevationDeg}
          onCommandElevationDegChange={(value) => setOpsConfig((prev) => ({ ...prev, commandElevationDeg: Number.isFinite(value) ? value : prev.commandElevationDeg }))}
          missionStatusItems={missionStatusItems}
        />

      </SettingsDialog>

      <section className="panel ops-dashboard">
        <div className="ops-target-card">
          <div className="seven-label">TRACKING SATELLITE</div>
          <div className="ops-target-name">{selectedSat?.name ?? "--"}</div>
          <div className="seven-sub">GS: {selectedStation?.name ?? "--"}</div>
        </div>
        <SevenSegment label="GS TIME" value={formatHmsInZone(now, opsConfig.timezone || "Asia/Tokyo")} sub={`${opsConfig.timezone || "Asia/Tokyo"} / UTC ${formatUtcHms(now)} / offset ${formatSignedMinutes(timeOffsetMinutes)}`} />
        <SevenSegment label="AZIMUTH" value={look ? look.azDeg.toFixed(1) : "--.-"} sub="deg" />
        <SevenSegment label="ELEVATION" value={look ? look.elDeg.toFixed(1) : "--.-"} sub="deg" accent={look?.visible ? "visible" : "hidden"} />
        <SevenSegment label="RANGE" value={look ? look.rangeKm.toFixed(0) : "----"} sub="km" />
        <SevenSegment
          label={`PASS TIMER ${passTimer.phase}`}
          value={passTimer.value}
          sub={passTimer.sub}
          accent={passTimer.inPass ? "visible" : ""}
        />
        <SevenSegment
          label={commandPassTimer.phase}
          value={commandPassTimer.value}
          sub={commandPassTimer.sub}
          accent={commandPassTimer.active ? "visible" : "command"}
        />
      </section>

      <ViewModeSelector viewMode={viewMode} onChange={setViewMode} />

      <section className={`visual-grid split-layout focus-${viewMode}`}>
        {viewMode !== "map" ? (
          <section className="panel radar-panel top-radar-panel" onDoubleClick={() => setViewMode(viewMode === "radar" ? "split" : "radar")}>
            <div className="panel-title-row">
              <h2>Radar Chart</h2>
              <span className={look?.visible ? "status-pill ok" : "status-pill ng"}>{look?.visible ? "VISIBLE" : "NOT VISIBLE"}</span>
            </div>
            <RadarChart look={look} station={selectedStation} radarConfig={radarConfig} passSeries={radarPassSeries} satMarkers={radarSatMarkers} selectedSatName={selectedSat?.name} skylineProfile={skylineProfile} />
            <div className="radar-path-legend multi-radar-legend">
              <div className="legend-title">{radarPassLegendItems.length ? radarPassLegendItems.join(" / ") : "No visible pass selected"}</div>
              <span className="legend-line solid" /> <span>SUNLIT</span>
              <span className="legend-line dashed" /> <span>ECLIPSE</span>
              <span className="legend-line nonvisible" /> <span>NON-VISIBLE</span>
              {pinnedPassIndices.length ? <span className="status-pill ok">{pinnedPassIndices.length} SELECTED</span> : <span className="status-pill">AUTO</span>}
            </div>
            <div className="radar-toolbar">
              <label className="button compact file-button">
                Upload skyline image
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={importRadarBackgroundFile} />
              </label>
              <label className="button compact file-button">
                Upload skyline CSV
                <input type="file" accept=".csv,text/csv,text/plain" onChange={importSkylineCsvFile} />
              </label>
              {skylineProfile?.rows?.length ? <span className="status-pill ok">Skyline CSV {skylineProfile.rows.length} pts</span> : null}
              {radarConfig?.attribution ? <span className="muted tiny truncate">{radarConfig.attribution}</span> : <span className="muted tiny">skyline image/CSV optional</span>}
            </div>
          </section>
        ) : null}

        {viewMode !== "radar" ? (
          <div className="panel map-panel" onDoubleClick={() => setViewMode(viewMode === "map" ? "split" : "map")}>
            <MapOrbitLegend orbitTrackConfig={orbitTrackConfig} />
            <WorldMap satellites={displayedSatellites} stations={stations} now={now} appConfig={appConfig} mapConfig={mapConfig} orbitTrackConfig={orbitTrackConfig} />
            <div className="map-toolbar">
              <select className="map-preset-select" defaultValue="" onChange={(e) => applyRecommendedMap(e.target.value)}>
                <option value="" disabled>Map preset</option>
                {RECOMMENDED_MAPS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </select>
              <button className="button compact" onClick={useBundledMap}>Use bundled map</button>
              <label className="button compact file-button">
                Upload map
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={importMapBackgroundFile} />
              </label>
              <button
                className="button compact"
                onClick={() => setMapConfig((prev) => ({ ...prev, projection: prev.projection === "mercator" ? "equirectangular" : "mercator" }))}
              >
                {mapConfig.projection}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <OperationTargetPanel
        selectedSat={selectedSat}
        satellites={satellites}
        onSelectedSatChange={setSelectedSatId}
        selectedStation={selectedStation}
        stations={stations}
        onSelectedStationChange={setSelectedStationId}
        visibleSatIds={visibleSatIds}
        onToggleVisibleSatellite={toggleVisibleSatellite}
        onSetAllVisible={setAllSatellitesVisible}
        onOpenSetup={() => setSettingsOpen(true)}
      />

      <section className="ops-data-row">
        <PassTable
          passes={passes}
        horizonHours={effectivePredictionHorizonHours}
        passWindowMode={passWindowMode}
        onPassWindowModeChange={setPassWindowMode}
        passDate={passDate}
        onPassDateChange={setPassDate}
        timeZone={opsConfig.timezone || "Asia/Tokyo"}
        selectedPassIndices={pinnedPassIndices}
        selectedOperationPassKeys={selectedOperationPassKeys}
        operationPassRegistry={operationPassRegistry}
        onSelectPass={toggleSelectedRadarPass}
        onSelectOperationPass={toggleOperationPass}
          onCopyPassText={copyPassTableText}
        />
        <DopplerOutputPanel
          csvDate={csvDate}
          onCsvDateChange={setCsvDate}
          onExportZip={exportPassCsvZip}
          exporting={exporting}
          selectedSat={selectedSat}
          selectedStation={selectedStation}
        />
      </section>

      <section className="panel detail-panel">
        <div className="panel-title-row">
          <h2>Detailed Information</h2>
          <span className="muted small">{selectedSat?.name ?? "--"} / {selectedStation?.name ?? "--"}</span>
        </div>
        <div className="state-grid detail-state-grid">
          <DataCard label="Satellite Lat" value={selectedState ? `${selectedState.latDeg.toFixed(4)} deg` : "--"} />
          <DataCard label="Satellite Lon" value={selectedState ? `${selectedState.lonDeg.toFixed(4)} deg` : "--"} />
          <DataCard label="Altitude" value={selectedState ? `${selectedState.altKm.toFixed(1)} km` : "--"} />
          <DataCard label="Visibility" value={look?.visible ? "VISIBLE" : "NOT VISIBLE"} accent={look?.visible ? "ok" : "ng"} />
          <DataCard label="Azimuth" value={look ? `${look.azDeg.toFixed(1)} deg` : "--"} />
          <DataCard label="Elevation" value={look ? `${look.elDeg.toFixed(1)} deg` : "--"} />
          <DataCard label="Range" value={look ? `${look.rangeKm.toFixed(0)} km` : "--"} />
          <DataCard label="Range Rate" value={currentObservation ? `${currentObservation.rangeRateMps.toFixed(1)} m/s` : "--"} />
          <DataCard label="Pass Timer" value={`${passTimer.phase} ${passTimer.value}`} accent={passTimer.inPass ? "ok" : undefined} />
          <DataCard label="Command Timer" value={`${commandPassTimer.phase} ${commandPassTimer.value}`} accent={commandPassTimer.active ? "ok" : undefined} />
          <DataCard label="Orbit Sunlight" value={currentEclipse.mode} accent={currentSunlit ? "ok" : "ng"} />
          <DataCard label="Ground Light" value={groundLight.solarElevationDeg !== null ? `${groundLight.mode} / ${groundLight.solarElevationDeg.toFixed(2)} deg` : "--"} accent={groundLight.mode === "DAY" ? "ok" : "ng"} />
          <DataCard label="Umbra Geometry" value={currentEclipse.separationDeg !== null ? `sep ${currentEclipse.separationDeg.toFixed(3)} / Earth ${currentEclipse.earthAngularDeg.toFixed(3)} / Sun ${currentEclipse.sunAngularDeg.toFixed(3)} deg` : "--"} />
          <DataCard label="Map Projection" value={mapConfig.projection} />
          <DataCard label="Track Color Mode" value={orbitTrackConfig.colorMode} />
          <DataCard label="Uplink f0" value={`${opsConfig.uplinkBaseFrequencyHz.toFixed(0)} Hz`} />
          <DataCard label="Downlink f0" value={`${opsConfig.downlinkBaseFrequencyHz.toFixed(0)} Hz`} />
        </div>
      </section>

    </main>
  );
}


export default App;
