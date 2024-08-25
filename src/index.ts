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

function tileToGeoJSON(zoom: number, x: number, y: number): GeoJSON.Polygon {
	const n = Math.pow(2, zoom);
	const lon_deg = (x: number) => (x / n) * 360.0 - 180.0;
	const lat_rad = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
	const lat_deg = (y: number) => (lat_rad(y) * 180.0) / Math.PI;

	const minLon = lon_deg(x);
	const maxLon = lon_deg(x + 1);
	const minLat = lat_deg(y + 1);
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

function transformCoordinatesToPixels(geoJSON: GeoJSON.Position[] | GeoJSON.Position[][], imageBBox: number[], size: number, xScalingFactor: number, yScalingFactor: number): [number, number][] {
	return geoJSON.map(([geoX, geoY]) => {
		if (typeof geoX !== "number" || typeof geoY !== "number") {
			throw new Error("Invalid GeoJSON");
		}

		const x = (geoX - imageBBox[0]) * xScalingFactor;
		const y = size - (geoY - imageBBox[1]) * yScalingFactor; // Invert y
		return [x, y];
	});
}

export default async function main(geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString> | GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.LineString>, tile: [number, number, number], settings?: Settings): Promise<Buffer> {
	const size = settings?.size ?? 256;
	let image = sharp({
		"create": {
			"width": size,
			"height": size,
			"channels": 4,
			"background": settings?.backgroundColor ?? {
				"r": 0,
				"g": 0,
				"b": 0,
				"alpha": 0
			}
		}
	});

	let collection: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.LineString>;
	if (geojson.type === "FeatureCollection") {
		collection = geojson;
	} else {
		collection = turf.featureCollection([geojson]);
	}
	const imagePolygon = tileToGeoJSON(tile[0], tile[1], tile[2]);
	const imagePolygonBBox = turf.bbox(imagePolygon);
	const xScalingFactor = size / (imagePolygonBBox[2] - imagePolygonBBox[0]);
	const yScalingFactor = size / (imagePolygonBBox[3] - imagePolygonBBox[1]);

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">`;
	for (const feature of collection.features) {
		if (feature.geometry.type === "Polygon") {
			const intersectingPolygon = turf.intersect(turf.featureCollection([feature as GeoJSON.Feature<GeoJSON.Polygon>, turf.feature(imagePolygon)]));

			if (!intersectingPolygon) {
				continue;
			}

			const transformedPoints = transformCoordinatesToPixels(intersectingPolygon.geometry.coordinates[0], imagePolygonBBox, size, xScalingFactor, yScalingFactor);

			svg += `<polygon points="${transformedPoints.map(([x, y]) => `${x},${y}`).join(" ")}" fill="${feature.properties?.["fill"] ?? "black"}" fill-opacity="${feature.properties?.["fill-opacity"] ?? "1.0"}" />`;
		} else if (feature.geometry.type === "LineString") {
			const transformedPoints = transformCoordinatesToPixels(feature.geometry.coordinates, imagePolygonBBox, size, xScalingFactor, yScalingFactor);

			svg += `<polyline points="${transformedPoints.map(([x, y]) => `${x},${y}`).join(" ")}" fill="none" stroke="${feature.properties?.["stroke"] ?? "black"}" stroke-width="${feature.properties?.["stroke-width"] ?? "1"}" stroke-opacity="${feature.properties?.["stroke-opacity"] ?? "1.0"}" />`;
		} else {
			// Throwing an error for JavaScript users. TypeScript users should have already caught this error during compilation due to invalid types.
			throw new Error(`Unsupported geometry type: ${(feature as any).geometry.type}`);
		}
	}
	svg += "</svg>";

	image.composite([{
		"input": Buffer.from(svg)
	}]);

	return await image.png().toBuffer();
}
