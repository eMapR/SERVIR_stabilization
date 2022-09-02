//######################################################################################################## 
//#                                                                                                    #\\
//#                   Visualization tool for comparing stabilized composites                           #\\
//#                                                                                                    #\\
//########################################################################################################

// date: 2022-08-30
// author: Ben Roberts-Pierel | robertsb@oregonstate.edu
//         Peter Clary        | clarype@oregonstate.edu
//         Robert Kennedy     | rkennedy@coas.oregonstate.edu

// website: https://github.com/eMapR/LT-GEE

var ltop = require('users/ak_glaciers/adpc_servir_LTOP:modules/LTOP_modules.js');
var startYear = 1990; 
var endYear = 2021; 
///////////////////////////////////////////////////////////////
// STOP!!!! README FIRST!!!!
// NOTE that this program is just experimental is is likely to have some problems. 
// CHANGE inputs accordingly
///////////////////////////////////////////////////////////////

//This should just be replaced with the correct imageCollection of SERVIR composites 
function buildSERVIRcompsIC(startYear,endYear){
//get the SERVIR composites
  var yr_images = []; 
  for (var y = startYear;y < endYear+1; y++){
    var im = ee.Image("projects/servir-mekong/composites/" + y.toString()); 
    yr_images.push(im); 
  }
  var servir_ic = ee.ImageCollection.fromImages(yr_images); 
  
  //it seems like there is an issue with the dates starting on January 1. This is likely the result of a time zone difference between where 
  //the composites were generated and what the LandTrendr fit algorithm expects from the timestamps. 
  servir_ic = servir_ic.map(function(img){
    var date = img.get('system:time_start'); 
    return img.set('system:time_start',ee.Date(date).advance(6,'month').millis()); 
  }); 
return servir_ic; 
}


//Replace this with the imageCollection of your selected region 
function buildStabilizedCompsIC(startYear,endYear){
//get the SERVIR composites
  var yr_images = []; 
  for (var y = startYear;y < endYear+1; y++){
    var im = ee.Image("users/ak_glaciers/stabilized_servir_composites/servir_"+y+"_stabilized_servir_basin_comps_test_aoi_updated"); 
    yr_images.push(im); 
  }
  var servir_ic = ee.ImageCollection.fromImages(yr_images); 
  return servir_ic
}  

//////////////////////////////////////////////////////////
//you should be able to just start here by replacing the below function calls with the appropriate imageCollections 
var servir_comps = buildSERVIRcompsIC(startYear,endYear); 
var stab_comps = buildStabilizedCompsIC(startYear,endYear);

servir_comps = servir_comps.map(function(img){
  return img.set('source','original'); 
})

//this should be irrelevant depending on how you create your imageCollection - this may also be something that needs to be amended in the 
//script that creates the stabilized composites 
stab_comps = stab_comps.map(function(img){
  return img.set('source','stabilized').set('system:time_start',ee.Number(img.get('year')).format()); 
}); 

////////////////////////////////////////////////////
//////////////////set up UI 
////////////////////////////////////////////////////

//define some initial functions 
var chartPoint = function(ic,band,x,y,prop){
  return ui.Chart.image.seriesByRegion({
    imageCollection: ic,
    band:band,
    regions:ee.Geometry.Point(x,y),
    reducer:ee.Reducer.first(),
    scale:30,
    seriesProperty:prop,
    // xProperty:'source'
  })
  // .setSeriesNames(bands)
  .setOptions({
    title: 'SERVIR composites with stabilization'
    // hAxis: {title:'Reflectance (adjusted)'},
    // vAxis: {title:'Count'}
  }); 

}; 

// function to draw plots of source and fitted time series to panel
var plotTimeSeries = function(x, y){  
  // clear the plot panel
  plotPanel = plotPanel.clear();
  
  // add a red pixel to the map where the user clicked or defined a coordinate
  var point = ee.Geometry.Point(x, y);
  var pixel = point.buffer(15).bounds();
  map.layers().set(0, ui.Map.Layer(pixel, {color: 'FF0000'}));

  // get values to define year and date window for image collection
  var chart1 = chartPoint(servir_comps, 'nir', x, y,'system:index');
  var chart2 = chartPoint(stab_comps, 'nir_fit', x, y,'year');
  plotPanel.add(chart1);
  plotPanel.add(chart2);
  
};

// var year = yearBox.getValue();


// SET UP PRIMARY PANELS
// control panel
var controlPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {width: '340px'}
});

// coordinate panel
var coordSectionLabel = ui.Label('Define Pixel Coordinates (optional)',{fontWeight: 'bold'});

var latLabel = ui.Label('Latitude:');
var latBox = ui.Textbox({value:15});
latBox.style().set('stretch', 'horizontal');

var lonLabel = ui.Label('Longitude:');
var lonBox = ui.Textbox({value:105});
lonBox.style().set('stretch', 'horizontal');

var latLonPanel = ui.Panel(
  [
    coordSectionLabel,
    ui.Panel([lonLabel, lonBox, latLabel, latBox],ui.Panel.Layout.Flow('horizontal'))
  ],
  null,
  {stretch: 'horizontal'}
);

// plot panel
var plotsPanelLabel = ui.Label('LandTrendr Time Series Plots', {fontWeight: 'bold', stretch: 'horizontal'});
var plotPanel = ui.Panel(null, null, {stretch: 'horizontal'});
var plotPanelParent = ui.Panel([plotsPanelLabel, plotPanel], null, {width: '480px'});


// map panel
var map = ui.Map();
map.centerObject(ee.Geometry.Point([105,15]),5); 
map.style().set({cursor:'crosshair'});
map.setOptions('HYBRID');
var processingLabel = ui.Label('Processing, please wait...', {shown:false, position: 'top-center'});
map.add(processingLabel);

//Set up labels
var yearSectionLabel = ui.Label('Define Year Range',{fontWeight: 'bold'});

// date panel
var yearSectionLabel = ui.Label('Define year of interest',{fontWeight: 'bold'});
var yearLabel = ui.Label('Year (between 1990 and 2021)'); //HARDCODED
var yearBox = ui.Textbox({value:'2000'});
yearBox.style().set('stretch', 'horizontal');

var timePanel = ui.Panel(
  [
    yearSectionLabel,
    ui.Panel(
      [yearLabel, yearBox],
      ui.Panel.Layout.Flow('horizontal'), {stretch: 'horizontal'}
    )
  ]
);

// submit panel
var submitButton = ui.Button({label: 'Submit'});
submitButton.style().set('stretch', 'horizontal');

//####################################################################################
//########### BIND FUNCTIONS TO ACTIONS ##############################################
//####################################################################################

// plot time series for clicked point on map
map.onClick(function(coords) {
  var x = coords.lon;
  var y = coords.lat;
  lonBox.setValue(x);
  latBox.setValue(y);
  // runParams = getParams();
  plotTimeSeries(x, y);
});

//add some layers to see what they look like 
map.layers().set(0, ui.Map.Layer(servir_comps.filter(ee.Filter.eq('system:index',yearBox.getValue())).select('swir1','nir','red'), {min:0,max:6000}, 'SERVIR composite'));            
map.layers().set(1, ui.Map.Layer(stab_comps.filter(ee.Filter.eq('year',ee.Number.parse(yearBox.getValue()))).select('swir1_fit','nir_fit','red_fit'), {min:0,max:6000}, 'Stabilized composite'));            

// plot time series for point defined as coordinates
submitButton.onClick(function(){
  var x = parseFloat(lonBox.getValue());
  var y = parseFloat(latBox.getValue());
  // runParams = getParams();
  plotTimeSeries(x, y);
  map.setCenter(x, y, 16);
});

//####################################################################################
//########### ADD PANELS TO INTERFACE ################################################
//####################################################################################

// controlPanel.add(yearsPanel);
controlPanel.add(timePanel);
// controlPanel.add(indexPanelLabel);
// controlPanel.add(indexPanel);
controlPanel.add(latLonPanel);
// controlPanel.add(paramPanel);
controlPanel.add(submitButton);

map.add(ui.Label({
  value: 'Click a point',
  style: {position: 'top-center'}
}));

map.add(ui.Label({
  value: 'More info',
  style: {position: 'bottom-right'},
  targetUrl: 'https://emapr.github.io/LT-GEE/ui-applications.html#ui-landtrendr-pixel-time-series-plotter'
}));

ui.root.clear();
ui.root.add(controlPanel);
ui.root.add(map);
ui.root.add(plotPanelParent);



