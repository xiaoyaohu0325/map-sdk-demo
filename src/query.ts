import WebMap from "@arcgis/core/WebMap.js";
import esriConfig from "@arcgis/core/config.js";
import MapView from "@arcgis/core/views/MapView.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import BufferParameters from "@arcgis/core/rest/support/BufferParameters.js";
import * as projection from "@arcgis/core/geometry/projection.js";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import * as geometryService from "@arcgis/core/rest/geometryService.js";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine.js";

// equal area map
// https://esridevbeijing.maps.arcgis.com/home/item.html?id=568f4c016c6d486f8382778fd9675f2c

esriConfig.portalUrl = "https://esridevbeijing.maps.arcgis.com/";

function createMap(itemId, containerId) {
  const map = new WebMap({
    portalItem: {
      // autocasts as new PortalItem()
      id: itemId,
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
  map.add(graphicsLayer);

  const view = new MapView({
    map: map, // The WebMap instance created above
    container: containerId,
  });

  return {map, view, graphicsLayer};
}

const {map: map1, view: view1, graphicsLayer: graphicsLayer1} = createMap("42b447816cd148e4848f9bb62be7aa2f", "viewDiv")
const {map: map2, view: view2, graphicsLayer: graphicsLayer2} = createMap("568f4c016c6d486f8382778fd9675f2c", "viewDiv2")

Promise.all([map1.loadAll(), map2.loadAll()]).then(() => {
  Promise.all([view1.when(), view2.when()]).then(async () => {
    const queryLayer1 = map1.findLayerById(
      "18e7dbeacdd-layer-2",
    ) as __esri.FeatureLayer;

    const layerView1 = (await view1.whenLayerView(
      queryLayer1,
    )) as __esri.FeatureLayerView;
    layerView1.highlightOptions = {
      color: "#FF00FF", //bright fuchsia
      haloOpacity: 0.8,
      fillOpacity: 0.3,
    };

    const queryLayer2 = map2.findLayerById(
      "18ec73ba740-layer-91",
    ) as __esri.FeatureLayer;

    const layerView2 = (await view2.whenLayerView(
      queryLayer2,
    )) as __esri.FeatureLayerView;
    layerView2.highlightOptions = {
      color: "#FF00FF", //bright fuchsia
      haloOpacity: 0.8,
      fillOpacity: 0.3,
    };

    let isLoading = false;

    view1.on("click", async (event) => {
      if (isLoading) {
        return;
      }
      graphicsLayer1.removeAll();
      graphicsLayer2.removeAll();
      const response = await view1.hitTest(event);
      if (response.results.length > 0) {
        const rs = response.results.filter((result) => {
          return result.graphic.layer === queryLayer1;
        });
        if (rs.length > 0) {
          await handleSelectionChange(queryLayer1, rs[0].graphic);
          await applyToView2(queryLayer2, rs[0].graphic);
        }
      }
      isLoading = false;
    });

    // sync extent between view1 and view2
    reactiveUtils.watch(() => view1.extent, (extent) => {
      syncExtent(extent);
    });

    syncExtent(view1.extent);
  });
});

function syncExtent(view1Extent) {
  projection.load().then(() => {
    const v2Extent = projection.project(view1Extent, view2.spatialReference);
    view2.set("extent", v2Extent);
  });
}

async function handleSelectionChange(
  queryLayer: __esri.FeatureLayer,
  feature: __esri.Graphic,
) {
  const distance = 400;
  const units = "feet";

  const polygon = feature.geometry;

  // Query features
  const query = queryLayer.createQuery();
  query.geometry = polygon;
  query.distance = distance;
  query.units = units;
  query.spatialRelationship = "intersects";
  const result = await queryLayer.queryFeatures(query);
  if (result.features.length > 0) {
    graphicsLayer1.addMany(result.features);
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
  graphicsLayer1.add(graphic);
}

async function applyToView2(queryLayer: __esri.FeatureLayer, feature: __esri.Graphic) {
  const bufOrderElem = document.getElementById("bufOrder2") as HTMLInputElement;
  let bufferAfterProject = false
  if (bufOrderElem.checked) {
    bufferAfterProject = true
  }

  const distance = 400;
  const units = "feet";

  const polygon = feature.geometry;

  let bufferPolygon: __esri.Geometry
  if (bufferAfterProject) {
    await projection.load()
    const projectedPolygon = projection.project(polygon, queryLayer.spatialReference) as __esri.Geometry
    bufferPolygon = await generateBuffer(projectedPolygon, distance, units);
  } else {
    bufferPolygon = await generateBuffer(polygon, distance, units);
    await projection.load()
    bufferPolygon = projection.project(bufferPolygon, queryLayer.spatialReference) as __esri.Geometry
  }

  // Query features
  const query = queryLayer.createQuery();
  query.geometry = bufferPolygon;
  query.spatialRelationship = "intersects";
  const result = await queryLayer.queryFeatures(query);
  if (result.features.length > 0) {
    graphicsLayer2.addMany(result.features);
  }

  // draw buffer polygon
  const graphic = new Graphic();
  graphic.geometry = bufferPolygon;
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
  graphicsLayer2.add(graphic);
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
