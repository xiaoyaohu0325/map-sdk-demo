import WebMap from "@arcgis/core/WebMap.js";
import esriConfig from "@arcgis/core/config.js";
import MapView from "@arcgis/core/views/MapView.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
import BufferParameters from "@arcgis/core/rest/support/BufferParameters.js";
import * as geometryService from "@arcgis/core/rest/geometryService.js";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine.js";

esriConfig.portalUrl = "https://esridevbeijing.maps.arcgis.com/";
const webmap = new WebMap({
  portalItem: {
    // autocasts as new PortalItem()
    id: "42b447816cd148e4848f9bb62be7aa2f",
  },
});
const graphicsLayer = new GraphicsLayer({
  symbol: {
    type: "simple-fill", // autocasts as new SimpleFillSymbol()
    color: [0, 51, 204, 0.6],
    style: "solid",
    outline: {
      // autocasts as new SimpleLineSymbol()
      color: "white",
      width: 1,
    },
  },
});
webmap.add(graphicsLayer);

const view = new MapView({
  map: webmap, // The WebMap instance created above
  container: "viewDiv",
});

webmap
  .loadAll()
  .then(() => {
    return view.when();
  })
  .then(async () => {
    const queryLayer = webmap.findLayerById(
      "18e7dbeacdd-layer-2",
    ) as __esri.FeatureLayer;

    const layerView = (await view.whenLayerView(
      queryLayer,
    )) as __esri.FeatureLayerView;
    layerView.highlightOptions = {
      color: "#FF00FF", //bright fuchsia
      haloOpacity: 0.8,
      fillOpacity: 0.3,
    };

    let isLoading = false;

    view.on("click", async (event) => {
      if (isLoading) {
        return;
      }
      graphicsLayer.removeAll();
      const response = await view.hitTest(event);
      if (response.results.length > 0) {
        const rs = response.results.filter((result) => {
          return result.graphic.layer === queryLayer;
        });
        if (rs.length > 0) {
          await handleSelectionChange(queryLayer, rs[0].graphic);
        }
      }
      isLoading = false;
    });
  });

async function handleSelectionChange(
  queryLayer: __esri.FeatureLayer,
  feature: __esri.Graphic,
) {
  const distance = 400;
  const units = "feet";

  const polygon = feature.geometry;

  // Query features
  let query = queryLayer.createQuery();
  query.geometry = polygon;
  query.distance = distance;
  query.units = units;
  query.spatialRelationship = "intersects";
  const result = await queryLayer.queryFeatures(query);
  if (result.features.length > 0) {
    graphicsLayer.addMany(result.features);
  }

  // Generate buffer
  const bufferGeometry = await generateBuffer(polygon, distance, units);
  const graphic = new Graphic();
  graphic.geometry = bufferGeometry;
  graphic.symbol = {
    type: "simple-fill", // autocasts as new SimpleFillSymbol()
    color: [255, 255, 0, 0.5],
    style: "solid",
    outline: {
      // autocasts as new SimpleLineSymbol()
      color: "white",
      width: 1,
    },
  };
  graphicsLayer.add(graphic);
}

async function generateBuffer(
  geometry: __esri.Geometry,
  distance: number,
  units: string,
) {
  let bufferGeometry: __esri.Geometry;
  if (
    geometry.spatialReference.isGeographic &&
    !geometry.spatialReference.isWGS84
  ) {
    const polygons = await geometryService.buffer(
      esriConfig.geometryServiceUrl,
      new BufferParameters({
        distances: [distance],
        unit: units as any,
        geodesic: true,
        bufferSpatialReference: geometry.spatialReference,
        outSpatialReference: geometry.spatialReference,
        geometries: [geometry],
      }),
    );
    bufferGeometry = polygons[0];
  } else if (
    geometry.spatialReference.isWGS84 ||
    geometry.spatialReference.isWebMercator
  ) {
    bufferGeometry = geometryEngine.geodesicBuffer(
      geometry,
      distance,
      units as any,
    ) as __esri.Geometry;
  } else {
    bufferGeometry = geometryEngine.buffer(
      geometry,
      distance,
      units as any,
    ) as __esri.Geometry;
  }
  return bufferGeometry;
}
