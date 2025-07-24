import * as sharp from "sharp";
import * as Jimp from "jimp";
import * as turf from "@turf/turf";

interface Settings {
	/**
	 * The background color of the tile.
	 *
	 * @default Transparent
	 */
	backgroundColor?: {
		"r": number;
		"g": number;
		"b": number;
		"alpha": number;
	};
	/**
	 * The size of the tile in pixels.
	 *
	 * @default 256
	 */
	size?: number;
}

/**
 * Converts a tile's z/x/y coordinates to a GeoJSON polygon representing the tile's bounds.
 * Uses the standard Web Mercator tile scheme where tiles are indexed from 0.
 *
 * @param zoom - The zoom level (0 = whole world, higher = more detailed)
 * @param x - The tile's x coordinate (horizontal position)
 * @param y - The tile's y coordinate (vertical position, 0 at top)
 * @returns A GeoJSON polygon with the tile's geographic bounds in WGS84 coordinates
 */
export function tileToGeoJSON(zoom: number, x: number, y: number): GeoJSON.Polygon {
	// Number of tiles at this zoom level (2^zoom tiles per side)
	const n = Math.pow(2, zoom);

	// Convert tile x coordinate to longitude
	const lon_deg = (x: number) => (x / n) * 360.0 - 180.0;

	// Convert tile y coordinate to latitude using inverse Web Mercator formula
	const lat_rad = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
	const lat_deg = (y: number) => (lat_rad(y) * 180.0) / Math.PI;

	// Calculate the bounds of this tile
	const minLon = lon_deg(x);
	const maxLon = lon_deg(x + 1);
	const minLat = lat_deg(y + 1);  // y+1 because y increases downward
	const maxLat = lat_deg(y);

	const geoJSON: GeoJSON.Polygon = {
		type: "Polygon",
		coordinates: [
			[
				[minLon, minLat], // bottom-left
				[maxLon, minLat], // bottom-right
				[maxLon, maxLat], // top-right
				[minLon, maxLat], // top-left
				[minLon, minLat]  // closing the polygon
			]
		]
	};

	return geoJSON;
}

/**
 * Converts WGS84 latitude/longitude coordinates to Web Mercator projection.
 * Web Mercator (EPSG:3857) is the standard projection used by most web mapping services.
 *
 * @param lon - Longitude in degrees (-180 to 180)
 * @param lat - Latitude in degrees (-90 to 90)
 * @returns [x, y] coordinates in Web Mercator projection (still in degrees)
 */
function latLonToWebMercator(lon: number, lat: number): [number, number] {
	// X coordinate in Web Mercator is just the longitude
	const x = lon;

	// Clamp latitude to avoid infinity at poles (Web Mercator limit)
	// Web Mercator cannot represent latitudes beyond ~85.05 degrees
	const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));

	// Apply Web Mercator transformation formula for Y coordinate
	// This stretches areas near the poles to create the characteristic Mercator distortion
	const y = Math.log(Math.tan((Math.PI / 4) + (clampedLat * Math.PI / 180) / 2)) * 180 / Math.PI;

	return [x, y];
}

/**
 * Transforms geographic coordinates to pixel coordinates within a tile image.
 * Handles the conversion from Web Mercator projected coordinates to screen pixels.
 *
 * @param geoJSON - Array of coordinate pairs [lon, lat] in WGS84
 * @param imageBBox - Bounding box of the tile in Web Mercator projection [minX, minY, maxX, maxY]
 * @param size - Size of the tile image in pixels
 * @param xScalingFactor - Pixels per degree longitude for this tile
 * @param yScalingFactor - Pixels per degree latitude for this tile
 * @returns Array of pixel coordinates [x, y] where (0,0) is top-left
 */
function transformCoordinatesToPixels(geoJSON: GeoJSON.Position[], imageBBox: number[], size: number, xScalingFactor: number, yScalingFactor: number): [number, number][] {
	return geoJSON.map(([geoX, geoY]) => {
		if (typeof geoX !== "number" || typeof geoY !== "number") {
			throw new Error("Invalid GeoJSON");
		}

		// Convert WGS84 coordinates to Web Mercator projection
		// This ensures proper scaling at different latitudes
		const [mercX, mercY] = latLonToWebMercator(geoX, geoY);

		// Transform from projected coordinates to pixel coordinates
		// Subtract the tile's minimum bounds to get relative position
		const x = (mercX - imageBBox[0]) * xScalingFactor;

		// Invert Y axis because screen coordinates have Y=0 at top
		// while geographic coordinates have Y increasing northward
		const y = size - (mercY - imageBBox[1]) * yScalingFactor;

		return [x, y];
	});
}

function transformPolygonCoordinatesToPixels(coordinates: GeoJSON.Position[][], imageBBox: number[], size: number, xScalingFactor: number, yScalingFactor: number): [number, number][][] {
	return coordinates.map(ring => transformCoordinatesToPixels(ring, imageBBox, size, xScalingFactor, yScalingFactor));
}

/**
 * Renders GeoJSON features (polygons and linestrings) to a tile image.
 * Uses Web Mercator projection to ensure compatibility with standard web map tiles.
 *
 * @param geojson - GeoJSON feature or feature collection to render
 * @param tile - Tile coordinates as [zoom, x, y]
 * @param settings - Optional settings for tile appearance
 * @returns PNG image buffer of the rendered tile
 */
export default async function main(geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point> | GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point>, tile: [number, number, number], settings?: Settings): Promise<Buffer> {
	const size = settings?.size ?? 256;

	// Create a blank image with specified or default background
	let image = sharp({
		"create": {
			"width": size,
			"height": size,
			"channels": 4,
			"background": settings?.backgroundColor ?? {
				"r": 0,
				"g": 0,
				"b": 0,
				"alpha": 0  // Transparent by default
			}
		}
	});

	// Ensure we have a feature collection to work with
	let collection: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point>;
	if (geojson.type === "FeatureCollection") {
		collection = geojson;
	} else {
		collection = turf.featureCollection([geojson]);
	}

	// Get the geographic bounds of this tile
	const imagePolygon = tileToGeoJSON(tile[0], tile[1], tile[2]);
	const imagePolygonBBox = turf.bbox(imagePolygon);

	// Convert the tile's bounding box from WGS84 to Web Mercator projection
	// This is crucial for proper scaling at different latitudes
	const [minLon, minLat, maxLon, maxLat] = imagePolygonBBox;
	const [minX, minY] = latLonToWebMercator(minLon, minLat);
	const [maxX, maxY] = latLonToWebMercator(maxLon, maxLat);
	const mercatorBBox = [minX, minY, maxX, maxY];

	// Calculate scaling factors to convert from projected coordinates to pixels
	const xScalingFactor = size / (mercatorBBox[2] - mercatorBBox[0]);
	const yScalingFactor = size / (mercatorBBox[3] - mercatorBBox[1]);

	// Build SVG containing all features
	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`;

	for (const feature of collection.features) {
		if (feature.geometry.type === "Polygon") {
			// For polygons, we need to clip to the tile boundary
			// Use Turf.js to find the intersection between the feature and tile bounds
			const intersectingPolygon = turf.intersect(turf.featureCollection([feature as GeoJSON.Feature<GeoJSON.Polygon>, turf.feature(imagePolygon)]));

			if (!intersectingPolygon) {
				// Feature doesn't overlap with this tile, skip it
				continue;
			}

			// Handle both Polygon and MultiPolygon results from intersection
			const polygonCoordinates = intersectingPolygon.geometry.type === "Polygon"
				? [intersectingPolygon.geometry.coordinates]
				: intersectingPolygon.geometry.coordinates;

			// Create SVG path for all polygons (handles holes with evenodd fill-rule)
			let pathData = "";
			for (const polygonRings of polygonCoordinates) {
				const transformedRings = transformPolygonCoordinatesToPixels(polygonRings, mercatorBBox, size, xScalingFactor, yScalingFactor);
				transformedRings.forEach((ring) => {
					const ringPath = ring.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
					pathData += ringPath + " Z ";
				});
			}

			// Add polygon to SVG with styling from feature properties, using evenodd fill-rule for holes
			svg += `<path d="${pathData}" fill="${feature.properties?.["fill"] ?? "black"}" fill-opacity="${feature.properties?.["fill-opacity"] ?? "1.0"}" fill-rule="evenodd" />`;

		} else if (feature.geometry.type === "LineString") {
			// For linestrings, convert coordinates directly (SVG will clip at boundaries)
			const transformedPoints = transformCoordinatesToPixels(feature.geometry.coordinates, mercatorBBox, size, xScalingFactor, yScalingFactor);

			// Add polyline to SVG with styling from feature properties
			svg += `<polyline points="${transformedPoints.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${feature.properties?.["stroke"] ?? "black"}" stroke-width="${feature.properties?.["stroke-width"] ?? "1"}" stroke-opacity="${feature.properties?.["stroke-opacity"] ?? "1.0"}" />`;

		} else if (feature.geometry.type === "Point") {
			// For points with text, convert the single coordinate
			const [lon, lat] = feature.geometry.coordinates;
			if (typeof lon !== "number" || typeof lat !== "number") {
				throw new Error("Invalid Point coordinates");
			}

			// Transform the point to pixel coordinates
			const [mercX, mercY] = latLonToWebMercator(lon, lat);
			const x = (mercX - mercatorBBox[0]) * xScalingFactor;
			const y = size - (mercY - mercatorBBox[1]) * yScalingFactor;

			// Skip if point is outside the tile bounds
			if (x < 0 || x > size || y < 0 || y > size) {
				continue;
			}

			// Get text properties with defaults
			const text = feature.properties?.["text"];
			if (!text) {
				// Skip points without text
				continue;
			}

			const fontFamily = feature.properties?.["font-family"] ?? "Arial";
			const fontSize = feature.properties?.["font-size"] ?? 14;
			const fontWeight = feature.properties?.["font-weight"] ?? "normal";
			const color = feature.properties?.["color"] ?? "black";
			const opacity = feature.properties?.["opacity"] ?? 1.0;
			const textAnchor = feature.properties?.["text-anchor"] ?? "middle";
			const dominantBaseline = feature.properties?.["dominant-baseline"] ?? "middle";

			// Map simplified baseline values to SVG values
			let svgBaseline = dominantBaseline;
			if (dominantBaseline === "top") {
				svgBaseline = "text-before-edge";
			} else if (dominantBaseline === "bottom") {
				svgBaseline = "text-after-edge";
			}

			// Add text element to SVG
			svg += `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" fill-opacity="${opacity}" text-anchor="${textAnchor}" dominant-baseline="${svgBaseline}">${text}</text>`;
		} else {
			// Throwing an error for JavaScript users. TypeScript users should have already caught this error during compilation due to invalid types.
			throw new Error(`Unsupported geometry type: ${(feature as any).geometry.type}`);
		}
	}
	svg += "</svg>";

	// Composite the SVG onto the base image
	image.composite([{
		"input": Buffer.from(svg)
	}]);

	// Return the final image as a PNG buffer
	return await image.png().toBuffer();
}
