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
		},
		{
			"type": "Feature",
			"properties": {
				"text": "Washington DC",
				"font-size": 16,
				"font-weight": "bold",
				"color": "#333333",
				"text-anchor": "middle",
				"dominant-baseline": "middle"
			},
			"geometry": {
				"type": "Point",
				"coordinates": [-77.009, 38.8895]
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
- Point (for text rendering)

## Supported GeoJSON Properties

### Polygon
- `fill` - Fill color (default: "black")
- `fill-opacity` - Fill opacity 0-1 (default: 1.0)

### LineString
- `stroke` - Stroke color (default: "black") 
- `stroke-opacity` - Stroke opacity 0-1 (default: 1.0)
- `stroke-width` - Stroke width in pixels (default: 1)

### Point (Text)
- `text` - Text content to display (required)
- `font-family` - Font family (default: "Arial")
- `font-size` - Font size in pixels (default: 14)
- `font-weight` - Font weight: "normal", "bold", or 100-900 (default: "normal")
- `color` - Text color (default: "black")
- `opacity` - Text opacity 0-1 (default: 1.0)
- `text-anchor` - Horizontal alignment: "start", "middle", "end" (default: "middle")
- `dominant-baseline` - Vertical alignment: "top", "middle", "bottom" (default: "middle")

## License

MIT
