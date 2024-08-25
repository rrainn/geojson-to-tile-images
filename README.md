# geojson-to-tile-images

This is a Node.js package that allows you to convert GeoJSON to tile images.

## Installation

```bash
npm install geojson-to-tile-images
```

## Usage

```typescript
import GeoJSONToTileImages from 'geojson-to-tile-images';
import * as fs from 'fs';

const geoJSON = {
	"type": "FeatureCollection",
	"features": [
		{
			"type": "Feature",
			"properties": {
				"fill": "red",
				"fill-opacity": 0.75
			},
			"geometry": {
				"coordinates": [
					[
						[
							-77.01321657760587,
							38.89222010921145
						],
						[
							-77.01321657760587,
							38.88703541565883
						],
						[
							-77.00512620244129,
							38.88703541565883
						],
						[
							-77.00512620244129,
							38.89222010921145
						],
						[
							-77.01321657760587,
							38.89222010921145
						]
					]
				],
				"type": "Polygon"
			}
		}
	]
};

(async () => {
	const image = await GeoJSONToTileImages(geoJSON, [15, 9374, 12536], {
		"backgroundColor": {
			"r": 0,
			"g": 0,
			"b": 0,
			"alpha": 0.5
		},
		"size": 256
	});
	fs.writeFileSync('image.png', image);
})();
```

## Supported GeoJSON Types

- Polygon
- LineString

## Supported GeoJSON Properties

- fill (only for Polygon)
- fill-opacity (only for Polygon)
- stroke (only for LineString)
- stroke-opacity (only for LineString)
- stroke-width (only for LineString)

## License

MIT
