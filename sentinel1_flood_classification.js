// ============================================================
// Sentinel-1 Flood Classification in Google Earth Engine
// Adapted from a NASA ARSET SAR flood-mapping exercise
// ============================================================


// ------------------------------------------------------------
// 1. Load Sentinel-1 SAR imagery
// ------------------------------------------------------------

var collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'ASCENDING'))
  .filterMetadata('resolution_meters', 'equals', 10)
  .filterBounds(roi)
  .select(['VV', 'VH']);


// ------------------------------------------------------------
// 2. Select pre- and post-flood imagery
// ------------------------------------------------------------

var before = collection
  .filterDate('2016-10-04', '2016-10-05')
  .mosaic();

var after = collection
  .filterDate('2016-10-16', '2016-10-17')
  .mosaic();


// ------------------------------------------------------------
// 3. Display original Sentinel-1 images
// ------------------------------------------------------------

Map.centerObject(roi, 7);

Map.addLayer(
  before,
  {min: -15, max: 0},
  'Before flood',
  false
);

Map.addLayer(
  after,
  {min: -15, max: 0},
  'After flood',
  false
);


// ------------------------------------------------------------
// 4. Apply focal-mean filtering to reduce speckle
// ------------------------------------------------------------

var SMOOTHING_RADIUS = 50;

var beforeFiltered = before.focal_mean(
  SMOOTHING_RADIUS,
  'circle',
  'meters'
);

var afterFiltered = after.focal_mean(
  SMOOTHING_RADIUS,
  'circle',
  'meters'
);

Map.addLayer(
  beforeFiltered,
  {min: -15, max: 0},
  'Before flood - filtered',
  false
);

Map.addLayer(
  afterFiltered,
  {min: -15, max: 0},
  'After flood - filtered',
  false
);


// ------------------------------------------------------------
// 5. Merge labelled training classes
// ------------------------------------------------------------

// Class 1 = Permanent open water
// Class 2 = Flooded open water
// Class 3 = Flooded vegetation
// Class 4 = Urban
// Class 5 = Flood channel
// Class 6 = Low vegetation

var trainingClasses = open_water_permanent
  .merge(open_water_flooded)
  .merge(flooded_vegetation)
  .merge(urban)
  .merge(flood_channel)
  .merge(low_vegetation);


// ------------------------------------------------------------
// 6. Combine pre- and post-flood VV/VH imagery
// ------------------------------------------------------------

// VV, VH       = pre-flood
// VV_1, VH_1   = post-flood

var final = ee.Image.cat(
  beforeFiltered,
  afterFiltered
);

var bands = [
  'VV',
  'VH',
  'VV_1',
  'VH_1'
];


// ------------------------------------------------------------
// 7. Extract training samples
// ------------------------------------------------------------

var training = final.select(bands).sampleRegions({
  collection: trainingClasses,
  properties: ['landcover'],
  scale: 30
});


// ------------------------------------------------------------
// 8. Train CART classifier
// ------------------------------------------------------------

var classifier = ee.Classifier.smileCart().train({
  features: training,
  classProperty: 'landcover',
  inputProperties: bands
});


// ------------------------------------------------------------
// 9. Classify imagery
// ------------------------------------------------------------

var classified = final
  .select(bands)
  .classify(classifier);


// ------------------------------------------------------------
// 10. Display classification
// ------------------------------------------------------------

var classPalette = [
  '1381f2', // Permanent open water
  '3adfff', // Flooded open water
  'f727ff', // Flooded vegetation
  'f1fa09', // Urban
  '4eff0d', // Flood channel
  '006400'  // Low vegetation
];

Map.addLayer(
  classified,
  {
    min: 1,
    max: 6,
    palette: classPalette
  },
  'Flood classification',
  true
);


// ------------------------------------------------------------
// 11. Create flood-affected mask
// ------------------------------------------------------------

// Classes 2 and 3 represent:
// - Flooded open water
// - Flooded vegetation

var floodMask = classified
  .eq(2)
  .or(classified.eq(3))
  .selfMask();

Map.addLayer(
  floodMask,
  {palette: ['00FFFF']},
  'Flood-affected areas',
  false
);


// ------------------------------------------------------------
// 12. Training confusion matrix
// ------------------------------------------------------------

// This is resubstitution accuracy calculated from the
// training data. It is NOT independent validation accuracy.

print(
  'CART training confusion matrix:',
  classifier.confusionMatrix()
);

print(
  'CART training (resubstitution) accuracy:',
  classifier.confusionMatrix().accuracy()
);


// ------------------------------------------------------------
// 13. Add road network for spatial context
// ------------------------------------------------------------

var roadsDataset = ee.FeatureCollection('TIGER/2016/Roads')
  .filterBounds(roi);

var roads = roadsDataset.style({
  color: 'A28F54',
  width: 1
});

Map.addLayer(
  roads,
  {},
  'Road network',
  false
);


// ------------------------------------------------------------
// 14. Export classification
// ------------------------------------------------------------

// The export is restricted to the ROI using the "region"
// parameter, so the classified image does not need to be
// clipped beforehand.

Export.image.toDrive({
  image: classified,
  description: 'Sentinel1_Flood_Classification',
  region: roi,
  scale: 10,
  maxPixels: 1e10,
  fileFormat: 'GeoTIFF'
});

Add Sentinel-1 flood classification workflow
