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
OBJECT A@https://celestrak.org/NORAD/elements/gp.php?CATNR=68792&FORMAT=TLE
OBJECT B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68793&FORMAT=TLE
OBJECT C@https://celestrak.org/NORAD/elements/gp.php?CATNR=68794&FORMAT=TLE
OBJECT D@https://celestrak.org/NORAD/elements/gp.php?CATNR=68795&FORMAT=TLE
OBJECT E@https://celestrak.org/NORAD/elements/gp.php?CATNR=68796&FORMAT=TLE
OBJECT F@https://celestrak.org/NORAD/elements/gp.php?CATNR=68797&FORMAT=TLE
OBJECT G@https://celestrak.org/NORAD/elements/gp.php?CATNR=68798&FORMAT=TLE
OBJECT H@https://celestrak.org/NORAD/elements/gp.php?CATNR=68799&FORMAT=TLE
ELECTRON R/B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68800&FORMAT=TLE
ELECTRON KICK STAGE R/B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68801&FORMAT=TLE
RAISE-4@https://celestrak.org/NORAD/elements/gp.php?CATNR=67073&FORMAT=TLE`;


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

function normalizeStation(raw = {}, index = 0, fallbackMinElevationDeg = 0) {
  return {
    id: safeString(raw.id, `gs-${index + 1}`),
    name: safeString(raw.name, `Ground Station ${index + 1}`),
    latDeg: safeNumber(raw.latDeg ?? raw.latitudeDeg ?? raw.latitude_deg ?? raw.lat, 0),
    lonDeg: safeNumber(raw.lonDeg ?? raw.longitudeDeg ?? raw.longitude_deg ?? raw.lon, 0),
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
    satellites = [];
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
  return `# SatPass Ops Console 設定例 v14
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
# tle_url / update_url / catnr を指定した衛星は、Fetch TLE URLs でCelesTrak等からTLEを取得できます。
satellites:
  - id: iss
    name: ISS (ZARYA)
    color: "#22c55e"
    tle: |
      ISS (ZARYA)
      1 25544U 98067A   26001.50000000  .00010000  00000+0  18000-3 0  9990
      2 25544  51.6400 120.0000 0006000  20.0000 340.0000 15.50000000000000

# TLE取得元。name@url 形式の複数行文字列、配列、または satellites[].tle_url に対応します。
# CelesTrak gp.php は FORMAT=TLE を推奨します。
tle_sources: |
  OBJECT A@https://celestrak.org/NORAD/elements/gp.php?CATNR=68792&FORMAT=TLE
  OBJECT B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68793&FORMAT=TLE
  OBJECT C@https://celestrak.org/NORAD/elements/gp.php?CATNR=68794&FORMAT=TLE
  OBJECT D@https://celestrak.org/NORAD/elements/gp.php?CATNR=68795&FORMAT=TLE
  OBJECT E@https://celestrak.org/NORAD/elements/gp.php?CATNR=68796&FORMAT=TLE
  OBJECT F@https://celestrak.org/NORAD/elements/gp.php?CATNR=68797&FORMAT=TLE
  OBJECT G@https://celestrak.org/NORAD/elements/gp.php?CATNR=68798&FORMAT=TLE
  OBJECT H@https://celestrak.org/NORAD/elements/gp.php?CATNR=68799&FORMAT=TLE
  ELECTRON R/B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68800&FORMAT=TLE
  ELECTRON KICK STAGE R/B@https://celestrak.org/NORAD/elements/gp.php?CATNR=68801&FORMAT=TLE
  RAISE-4@https://celestrak.org/NORAD/elements/gp.php?CATNR=67073&FORMAT=TLE

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

function predictionStartDateFromMode(now, timeZone, mode) {
  const selected = safeString(mode, "today").toLowerCase();
  if (selected === "today") {
    const today = formatYmdInZone(now, timeZone);
    return parseObservationStartUtc(today, timeZone);
  }
  return now;
}

function predictionHorizonHoursFromMode(now, timeZone, mode) {
  const selected = safeString(mode, "today").toLowerCase();
  if (selected === "today") return 24;
  return clamp(safeNumber(selected.replace("h", ""), 12), 0.25, 168);
}

function predictionHorizonLabel(mode, hours) {
  const selected = safeString(mode, "today").toLowerCase();
  if (selected === "today") return "today / 00:00-24:00";
  return `${hours.toFixed(0)} h`;
}

function formatMonthDayInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${p.month}/${p.day}`;
}

function formatHmInZone(date, timeZone) {
  const p = getZonedParts(date, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

function buildPassCopyText(passes, timeZone) {
  if (!passes.length) return "No visible pass in the selected prediction window.";
  const byDate = new Map();
  for (const pass of passes) {
    const key = formatMonthDayInZone(pass.aos, timeZone);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(pass);
  }

  const lines = [
    "Pass[日付No] [AOS時刻]to[LOS時刻]@MEL=[MEL][deg.] の形式で書いております",
    "",
  ];
  for (const [dateLabel, datePasses] of byDate.entries()) {
    lines.push(dateLabel);
    datePasses.forEach((pass, index) => {
      lines.push(`Pass[${pad2(index + 1)}] ${formatHmInZone(pass.aos, timeZone)} to ${formatHmInZone(pass.los, timeZone)} @ MEL=${pass.maxElDeg.toFixed(1)}[deg.]`);
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

function buildPassTimer(passes, now, timeZone) {
  const active = passes.find((pass) => now >= pass.aos && now <= pass.los);
  if (active) {
    return {
      phase: "LOS",
      value: formatDuration(active.los.getTime() - now.getTime()),
      sub: `to LOS ${formatIsoInZone(active.los, timeZone)}`,
      inPass: true,
    };
  }
  const next = passes.find((pass) => pass.aos > now) || passes[0];
  if (next) {
    return {
      phase: "AOS",
      value: formatDuration(next.aos.getTime() - now.getTime()),
      sub: `to AOS ${formatIsoInZone(next.aos, timeZone)}`,
      inPass: false,
    };
  }
  return { phase: "AOS", value: "--:--:--", sub: "no pass in prediction window", inPass: false };
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

function predictPasses(tle, station, startDate, horizonHours = 12, stepSec = 30) {
  const passes = [];
  let inPass = false;
  let current = null;
  for (let dt = 0; dt <= horizonHours * 3600; dt += stepSec) {
    const date = new Date(startDate.getTime() + dt * 1000);
    const obs = computeObservation(tle, station, date, 1);
    const visible = !!obs?.visible;
    if (visible && !inPass) {
      inPass = true;
      current = { aos: date, los: date, maxElDeg: obs.elDeg, maxElTime: date, rangeAtMaxElKm: obs.rangeKm, minRangeKm: obs.rangeKm };
    } else if (visible && inPass && current) {
      current.los = date;
      if (obs.elDeg > current.maxElDeg) {
        current.maxElDeg = obs.elDeg;
        current.maxElTime = date;
        current.rangeAtMaxElKm = obs.rangeKm;
      }
      current.minRangeKm = Math.min(current.minRangeKm, obs.rangeKm);
    } else if (!visible && inPass && current) {
      passes.push(current);
      inPass = false;
      current = null;
      if (passes.length >= 8) break;
    }
  }
  if (inPass && current) passes.push(current);
  return passes;
}

function refineVisiblePass(tle, station, startMs, endMs, stepSec = 1) {
  const visibleRows = [];
  for (let ms = startMs; ms <= endMs; ms += stepSec * 1000) {
    const date = new Date(ms);
    const obs = computeObservation(tle, station, date, 1);
    if (obs?.visible) visibleRows.push({ date, obs });
  }
  if (!visibleRows.length) return null;

  let max = visibleRows[0];
  let minRange = visibleRows[0];
  for (const row of visibleRows) {
    if (row.obs.elDeg > max.obs.elDeg) max = row;
    if (row.obs.rangeKm < minRange.obs.rangeKm) minRange = row;
  }
  return {
    aos: visibleRows[0].date,
    los: visibleRows[visibleRows.length - 1].date,
    maxElDeg: max.obs.elDeg,
    maxElTime: max.date,
    rangeAtMaxElKm: max.obs.rangeKm,
    minRangeKm: minRange.obs.rangeKm,
    rows: visibleRows,
  };
}

function computeDayPassesForExport(tle, station, ops) {
  const tz = ops.timezone || "Asia/Tokyo";
  const dayStart = parseObservationStartUtc(ops.observationDate, tz);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const searchStartMs = dayStart.getTime() - 90 * 60 * 1000;
  const searchEndMs = dayEnd.getTime() + 90 * 60 * 1000;
  const coarseStepMs = 10 * 1000;

  const intervals = [];
  let visible = false;
  let startMs = null;
  for (let ms = searchStartMs; ms <= searchEndMs; ms += coarseStepMs) {
    const obs = computeObservation(tle, station, new Date(ms), 1);
    const v = !!obs?.visible;
    if (v && !visible) {
      visible = true;
      startMs = ms;
    } else if (!v && visible) {
      intervals.push({ startMs, endMs: ms });
      visible = false;
      startMs = null;
    }
  }
  if (visible && startMs !== null) intervals.push({ startMs, endMs: searchEndMs });

  return intervals
    .map((interval) => refineVisiblePass(tle, station, interval.startMs - 60_000, interval.endMs + 60_000, 1))
    .filter(Boolean)
    .filter((pass) => pass.los >= dayStart && pass.aos <= dayEnd);
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

function sampleRadarPath(tle, station, pass, stepSec = 20) {
  if (!tle || !station || !pass?.aos || !pass?.los) return [];
  const rows = [];
  const start = pass.aos.getTime();
  const end = pass.los.getTime();
  const step = Math.max(5, stepSec) * 1000;
  for (let ms = start; ms <= end; ms += step) {
    const date = new Date(ms);
    const obs = computeObservation(tle, station, date, 1);
    if (obs?.visible) rows.push({ date, ...obs, eclipseMode: computeEclipseStatus(obs.state, date).mode });
  }
  if (!rows.some((row) => Math.abs(row.date.getTime() - end) < 500)) {
    const obs = computeObservation(tle, station, new Date(end), 1);
    if (obs?.visible) rows.push({ date: new Date(end), ...obs, eclipseMode: computeEclipseStatus(obs.state, new Date(end)).mode });
  }
  return rows;
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
  if (row?.eclipseMode) return row.eclipseMode;
  if (row?.state) return computeEclipseStatus(row.state, row.date).mode;
  return "SUNLIT";
}

function buildRadarRenderSegments(rows, cx, cy, rMax) {
  const segments = [];
  for (let i = 1; i < rows.length; i += 1) {
    const a = radarPointFromAzEl(rows[i - 1].azDeg, rows[i - 1].elDeg, cx, cy, rMax);
    const b = radarPointFromAzEl(rows[i].azDeg, rows[i].elDeg, cx, cy, rMax);
    const mode = radarModeForRow(rows[i]);
    segments.push({ d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`, mode });
  }
  return segments;
}

function RadarChart({ look, station, radarConfig, passSeries = [], satMarkers = [], selectedSatName }) {
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const rMax = 116;
  const el = look?.elDeg ?? -90;
  const az = look?.azDeg ?? 0;
  const marker = radarPointFromAzEl(az, el, cx, cy, rMax);
  const normalizedSeries = Array.isArray(passSeries) ? passSeries : [];

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
      {normalizedSeries.map((series, seriesIndex) => {
        const rows = series.rows || [];
        const segments = buildRadarRenderSegments(rows, cx, cy, rMax);
        const start = rows[0] ? radarPointFromAzEl(rows[0].azDeg, rows[0].elDeg, cx, cy, rMax) : null;
        const end = rows.length ? radarPointFromAzEl(rows[rows.length - 1].azDeg, rows[rows.length - 1].elDeg, cx, cy, rMax) : null;
        return (
          <g key={series.key || `series-${seriesIndex}`} className={`radar-series radar-series-${seriesIndex % 6}`}>
            {segments.map((segment, idx) => (
              <path key={`radar-pass-${seriesIndex}-${idx}`} d={segment.d} className={`radar-pass-segment ${segment.mode.toLowerCase()}`} />
            ))}
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

      <g className="track-legend">
        <rect x={width - 306} y="14" width="292" height="30" rx="10" className="track-legend-bg" />
        <circle cx={width - 286} cy="29" r="4" fill={orbitTrackConfig?.sunlitColor || "#22c55e"} />
        <text x={width - 278} y="33" className="track-legend-text">SUNLIT</text>
        <circle cx={width - 206} cy="29" r="4" fill={orbitTrackConfig?.penumbraColor || "#f59e0b"} />
        <text x={width - 198} y="33" className="track-legend-text">PENUMBRA</text>
        <circle cx={width - 108} cy="29" r="4" fill={orbitTrackConfig?.umbraColor || "#7c3aed"} />
        <text x={width - 100} y="33" className="track-legend-text">UMBRA</text>
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
      <div className="doppler-output-title">
        <span className="seven-label">DOPPLER CSV OUTPUT</span>
        <strong>{selectedSat?.name ?? "--"}</strong>
        <span className="muted tiny">{selectedStation?.name ?? "--"}</span>
      </div>
      <label className="inline-control doppler-date-control">
        CSV date
        <input type="date" value={csvDate} onChange={(e) => onCsvDateChange?.(e.target.value)} />
      </label>
      <button className="button compact primary export-main-button doppler-export-button" onClick={onExportZip} disabled={exporting}>
        {exporting ? "Exporting..." : "Export Doppler CSV ZIP"}
      </button>
    </section>
  );
}

function PassTable({ passes, horizonHours, passWindowMode, onPassWindowModeChange, timeZone, selectedPassIndices = [], onSelectPass, onCopyPassText }) {
  const selectedSet = new Set(selectedPassIndices);
  return (
    <section className="panel pass-panel">
      <div className="panel-title-row">
        <h2>Next Visible Passes</h2>
        <div className="panel-actions-inline pass-tools">
          <label className="inline-control">
            Window
            <select value={passWindowMode} onChange={(e) => onPassWindowModeChange?.(e.target.value)}>
              <option value="today">Today</option>
              <option value="12">12h</option>
              <option value="24">24h</option>
              <option value="48">48h</option>
              <option value="72">72h</option>
            </select>
          </label>
          <button className="button compact" type="button" onClick={onCopyPassText}>Text Copy</button>
          <span className="muted small">row click: radar plot select / unselect</span>
          <span className="muted small">{predictionHorizonLabel(passWindowMode, horizonHours)}</span>
        </div>
      </div>
      {passes.length === 0 ? (
        <p className="muted">No visible pass in the prediction window.</p>
      ) : (
        <table>
          <thead>
            <tr>
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
              const selected = selectedSet.has(i);
              return (
                <tr key={i} className={selected ? "selected-pass-row" : "clickable-pass-row"} onClick={() => onSelectPass?.(i)}>
                  <td>{selected ? "SELECTED" : `#${i + 1}`}</td>
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
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState("split");
  const [pinnedPassIndices, setPinnedPassIndices] = useState([]);
  const [passWindowMode, setPassWindowMode] = useState("today");
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
  }, [selectedSatId, selectedStationId, passWindowMode]);

  const selectedState = selectedSat ? computeSatState(selectedSat, now) : null;
  const look = selectedState && selectedStation ? computeLookAngles(selectedState, selectedStation) : null;
  const currentObservation = selectedSat && selectedStation ? computeObservation(selectedSat, selectedStation, now, 1) : null;
  const currentEclipse = selectedState ? computeEclipseStatus(selectedState, now) : { mode: "UNKNOWN", sunlit: false };
  const currentSunlit = currentEclipse.sunlit;
  const groundLight = selectedStation ? computeGroundLightStatus(selectedStation, now) : { mode: "--", solarElevationDeg: null };
  const predictionTimeKey = Math.floor(now.getTime() / 60000);
  const effectivePredictionHorizonHours = predictionHorizonHoursFromMode(now, opsConfig.timezone || "Asia/Tokyo", passWindowMode);
  const predictionStartDate = useMemo(() => predictionStartDateFromMode(now, opsConfig.timezone || "Asia/Tokyo", passWindowMode), [predictionTimeKey, opsConfig.timezone, passWindowMode]);
  const passes = useMemo(() => {
    if (!selectedSat || !selectedStation) return [];
    return predictPasses(selectedSat, selectedStation, predictionStartDate, effectivePredictionHorizonHours, safeNumber(appConfig.predictionStepSec, 30));
  }, [selectedSat, selectedStation, predictionStartDate, effectivePredictionHorizonHours, appConfig.predictionStepSec]);
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
  const passTimer = buildPassTimer(passes, now, opsConfig.timezone || "Asia/Tokyo");

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
    setConfigMessage("設定を適用しました。");
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
    setConfigMessage("ブラウザ内の保存設定を削除しました。現在の画面状態を残したい場合は Export YAML で保存してください。");
  }

  function openGitHubRepository() {
    window.open(GITHUB_REPOSITORY_URL, "_blank", "noopener,noreferrer");
  }

  function downloadTemplate() {
    downloadText("config_example.yaml", buildTemplateYaml(), "application/x-yaml");
  }

  function downloadTleSourceTemplate() {
    downloadText("kakushin_rising_tle_sources.yaml", `# KAKUSHIN RISING OBJECT A-H / Rocket bodies / RAISE-4\n# 取得は Fetch TLE URLs ボタンで実行します。\ntle_sources: |\n${DEFAULT_TLE_SOURCES_TEXT.split("\n").filter((line) => line.trim() && !line.trim().startsWith("#")).map((line) => `  ${line}`).join("\n")}\n`, "application/x-yaml");
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
    setConfigMessage(`KAKUSHIN RISING系TLE取得元を読み込みました。source_count=${sources.length}`);
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
      setConfigMessage(files.length === 1 ? `設定ファイルを読み込みました: ${files[0].name}` : `${files.length} 個の分割YAML/JSONを読み込みました。`);
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

  async function fetchTleSources() {
    if (!tleSources.length) {
      setConfigMessage("TLE取得元が未設定です。tle_sources または satellites[].tle_url をYAMLに追加してください。");
      return;
    }
    setExporting(true);
    setConfigMessage(`TLE URL から取得中です。source_count=${tleSources.length}`);
    try {
      const results = await Promise.allSettled(tleSources.map((source, index) => fetchSatelliteFromTleSource(source, index)));
      const fetched = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
      const failed = results.filter((result) => result.status === "rejected").map((result) => result.reason?.message || String(result.reason));
      if (!fetched.length) throw new Error(failed.join(" / ") || "全TLE取得に失敗しました。");

      setSatellites((prev) => {
        const next = [...prev];
        fetched.forEach((sat) => {
          const idx = next.findIndex((item) => item.id === sat.id || item.name === sat.name || item.sourceUrl === sat.sourceUrl);
          if (idx >= 0) next[idx] = { ...next[idx], ...sat, color: next[idx].color || sat.color };
          else next.push({ ...sat, color: SAT_COLORS[next.length % SAT_COLORS.length] });
        });
        return next;
      });
      setVisibleSatIds((prevIds) => Array.from(new Set([...prevIds, ...fetched.map((item) => item.id)])));
      setSelectedSatId(fetched[0]?.id ?? selectedSatId);
      setConfigMessage(`TLE取得完了: success=${fetched.length}, failed=${failed.length}${failed.length ? ` / ${failed.join(" / ")}` : ""}`);
    } catch (error) {
      setConfigMessage(`TLE取得に失敗しました: ${error.message}`);
    } finally {
      setExporting(false);
    }
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

  async function copyPassTableText() {
    const text = buildPassCopyText(passes, opsConfig.timezone || "Asia/Tokyo");
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
          <button className="button github-button" onClick={openGitHubRepository}>GitHub</button>
          <label className="offset-control">Offset min<input type="number" step="1" value={timeOffsetMinutes} onChange={(e) => setTimeOffsetMinutes(e.target.value)} /></label>
          <button className="button" onClick={() => setTimeOffsetMinutes(0)}>Offset 0</button>
        </div>
      </header>

      <DopplerOutputPanel
        csvDate={csvDate}
        onCsvDateChange={setCsvDate}
        onExportZip={exportPassCsvZip}
        exporting={exporting}
        selectedSat={selectedSat}
        selectedStation={selectedStation}
      />

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
        <SevenSegment label={`PASS TIMER ${passTimer.phase}`} value={passTimer.value} sub={passTimer.sub} accent={passTimer.inPass ? "visible" : ""} />
      </section>

      <ViewModeSelector viewMode={viewMode} onChange={setViewMode} />

      <section className={`visual-grid split-layout focus-${viewMode}`}>
        {viewMode !== "map" ? (
          <section className="panel radar-panel top-radar-panel" onDoubleClick={() => setViewMode(viewMode === "radar" ? "split" : "radar")}>
            <div className="panel-title-row">
              <h2>Radar Chart</h2>
              <span className={look?.visible ? "status-pill ok" : "status-pill ng"}>{look?.visible ? "VISIBLE" : "NOT VISIBLE"}</span>
            </div>
            <RadarChart look={look} station={selectedStation} radarConfig={radarConfig} passSeries={radarPassSeries} satMarkers={radarSatMarkers} selectedSatName={selectedSat?.name} />
            <div className="radar-path-legend multi-radar-legend">
              <div className="legend-title">{radarPassLegendItems.length ? radarPassLegendItems.join(" / ") : "No visible pass selected"}</div>
              <span className="legend-line solid" /> <span>SUNLIT</span>
              <span className="legend-line dashed" /> <span>ECLIPSE</span>
              {pinnedPassIndices.length ? <span className="status-pill ok">{pinnedPassIndices.length} SELECTED</span> : <span className="status-pill">AUTO</span>}
            </div>
            <div className="radar-toolbar">
              <label className="button compact file-button">
                Upload skyline
                <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={importRadarBackgroundFile} />
              </label>
              {radarConfig?.attribution ? <span className="muted tiny truncate">{radarConfig.attribution}</span> : <span className="muted tiny">skyline background optional</span>}
            </div>
          </section>
        ) : null}

        {viewMode !== "radar" ? (
          <div className="panel map-panel" onDoubleClick={() => setViewMode(viewMode === "map" ? "split" : "map")}>
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

      <PassTable
        passes={passes}
        horizonHours={effectivePredictionHorizonHours}
        passWindowMode={passWindowMode}
        onPassWindowModeChange={setPassWindowMode}
        timeZone={opsConfig.timezone || "Asia/Tokyo"}
        selectedPassIndices={pinnedPassIndices}
        onSelectPass={toggleSelectedRadarPass}
        onCopyPassText={copyPassTableText}
      />

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
          <DataCard label="Orbit Sunlight" value={currentEclipse.mode} accent={currentSunlit ? "ok" : "ng"} />
          <DataCard label="Ground Light" value={groundLight.solarElevationDeg !== null ? `${groundLight.mode} / ${groundLight.solarElevationDeg.toFixed(2)} deg` : "--"} accent={groundLight.mode === "DAY" ? "ok" : "ng"} />
          <DataCard label="Umbra Geometry" value={currentEclipse.separationDeg !== null ? `sep ${currentEclipse.separationDeg.toFixed(3)} / Earth ${currentEclipse.earthAngularDeg.toFixed(3)} / Sun ${currentEclipse.sunAngularDeg.toFixed(3)} deg` : "--"} />
          <DataCard label="Map Projection" value={mapConfig.projection} />
          <DataCard label="Track Color Mode" value={orbitTrackConfig.colorMode} />
          <DataCard label="Uplink f0" value={`${opsConfig.uplinkBaseFrequencyHz.toFixed(0)} Hz`} />
          <DataCard label="Downlink f0" value={`${opsConfig.downlinkBaseFrequencyHz.toFixed(0)} Hz`} />
        </div>
      </section>

      <section className="config-grid">
        <section className="panel control-panel">
          <h2>Tracking Target</h2>
          <div className="selected-control-target">Selected: <strong>{selectedSat?.name ?? "--"}</strong></div>
          <SatelliteDisplayPanel satellites={satellites} visibleSatIds={visibleSatIds} onToggle={toggleVisibleSatellite} onSetAllVisible={setAllSatellitesVisible} />
          <div className="tle-source-box">
            <div className="muted tiny">TLE URL sources: {tleSources.length}</div>
            <button className="button compact" onClick={loadDefaultTleSources}>Load KAKUSHIN URLs</button>
            <button className="button compact primary" onClick={fetchTleSources} disabled={exporting || !tleSources.length}>Fetch / Update TLE</button>
          </div>
          <label>
            Satellite
            <select value={selectedSat?.id ?? ""} onChange={(e) => setSelectedSatId(e.target.value)}>
              {satellites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>
            Ground Station
            <select value={selectedStation?.id ?? ""} onChange={(e) => setSelectedStationId(e.target.value)}>
              {stations.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label>
            Map Preset
            <select defaultValue="" onChange={(e) => applyRecommendedMap(e.target.value)}>
              <option value="" disabled>Recommended map URL</option>
              {RECOMMENDED_MAPS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>
          <div className="button-row">
            <button className="button compact" onClick={useBundledMap}>Bundled Map</button>
            <label className="button compact file-button">
              Upload Map Image
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={importMapBackgroundFile} />
            </label>
            <label className="button compact file-button">
              Upload Skyline
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={importRadarBackgroundFile} />
            </label>
          </div>
          <label>
            Orbit Track Color
            <select value={orbitTrackConfig.colorMode} onChange={(e) => setOrbitTrackConfig((prev) => ({ ...prev, colorMode: e.target.value }))}>
              <option value="sunlight">Sunlight / eclipse</option>
              <option value="satellite">Satellite color</option>
            </select>
          </label>
          <div className="app-tools-box">
            <div className="muted tiny">Application / configuration tools</div>
            <div className="button-row compact-tool-row">
              <button className="button compact" onClick={downloadTemplate}>Template YAML</button>
              <button className="button compact" onClick={downloadTleSourceTemplate}>TLE URL YAML</button>
              <button className="button compact" onClick={exportYaml}>Export YAML</button>
              <button className="button compact danger" onClick={clearLocalConfig}>Clear Local Config</button>
              <button className="button compact github-button" onClick={openGitHubRepository}>GitHub</button>
              <label className="button compact file-button">
                Import YAML(s)/JSON
                <input type="file" multiple accept=".yaml,.yml,.json,application/x-yaml,application/json" onChange={importConfigFile} />
              </label>
            </div>
            <p className="privacy-note">YAML/ローカル画像はブラウザ内で処理されます。外部通信はTLE取得URL・外部地図/背景画像URLへのGETリクエストが中心です。</p>
          </div>
        </section>

        <details className="panel config-panel">
          <summary>
            <span>YAML Configuration</span>
            <span className="muted small">click to edit</span>
          </summary>
          <p className="muted config-message">{configMessage}</p>
          <div className="button-row">
            <button className="button primary" onClick={applyConfigText}>Apply YAML</button>
            <button className="button" onClick={syncEditorFromCurrent}>Sync Current</button>
            <button className="button" onClick={downloadTemplate}>Download Template</button>
            <button className="button" onClick={downloadTleSourceTemplate}>Download TLE URL YAML</button>
            <button className="button danger" onClick={clearLocalConfig}>Clear Local Config</button>
          </div>
          <textarea className="config-textarea mono" spellCheck="false" value={configText} onChange={(e) => setConfigText(e.target.value)} aria-label="YAML configuration editor" />
        </details>
      </section>
    </main>
  );
}


export default App;
