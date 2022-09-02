//######################################################################################################## 
//#                                                                                                    #\\
//#                             SERVIR Composites temporal stabilization                               #\\
//#                                                                                                    #\\
//########################################################################################################
// date: 2022-06-01
// author: Ben Roberts-Pierel | robertsb@oregonstate.edu
//         Peter Clary        | clarype@oregonstate.edu
//         Robert Kennedy     | rkennedy@coas.oregonstate.edu
//         
// website: https://github.com/eMapR/LT-GEE
// This script requires some user-defined params as well as outputs of the LTOP LandTrendr process. 
// 1. cluster_image - this is the output of the kmeans algorithm (LTOP 02)
// 2. ltop_output - this is the final output of LTOP, a multiband image with the LandTrendr vertex breakpoints
// 3. table - these are the selected versions of LandTrendr that are used in the LTOP generation process 
// 4. dest_folder - this should be created and set by the user. This will be where the stabilized composites end up. Do not add a slash, its done for you below
/////////////////////////////////////////////////////////// 
////////////////////User params////////////////////////////
///////////////////////////////////////////////////////////

//import modules
var ftv_prep = require('users/ak_glaciers/adpc_servir:modules/temp_stab_modules.js'); 
var ltgee = require('users/ak_glaciers/adpc_servir_LTOP:modules/LandTrendr.js'); 
var params = require('users/ak_glaciers/adpc_servir_LTOP:modules/params.js'); 


//get the necessary inputs from LTOP process
var cluster_image = ee.Image("users/ak_glaciers/LTOP_snic_seed_points75k_kmeans_servir_basin_c2_comps"); 
var ltop_output = ee.Image('users/ak_glaciers/Optimized_LT_1990_start_servir_basin_comps_corrected'); 
var table = ee.FeatureCollection("users/ak_glaciers/LTOP_servir_basin_comps_kmeans_pts_config_selected_for_GEE_upload_new_weights_full");

//user params
var aoi = ee.FeatureCollection("projects/servir-mekong/hydrafloods/CountryBasinsBuffer").geometry(); 
var startYear = 1990; 
var endYear = 2021; 
var place = 'servir_basin_comps'; 
var min_obvs = 11;  
var dest_folder = "stabilized_servir_composites"; 

//build imageCollection of SERVIR composites 
var servir_ic = ltop.buildSERVIRcompsIC(startYear,endYear); 

servir_ic = servir_ic.filterBounds(aoi); 
//get a list of all the servir bands
var band_names = servir_ic.first().bandNames(); 
var num_bands = band_names.size(); 
print(num_bands.subtract(1)); 
///////////////////////////////////////////////////////////
////////////////////Bring in the LTOP outputs//////////////
///////////////////////////////////////////////////////////
//prep the breakpoints for LT-fit. These are the primary outputs of the LTOP process
var breakpoints = ftv_prep.prepBreakpoints(ltop_output); 

//run lt fit 
//this output will be an image where each band is a fitted value of time series for that band
//NOTE that this is pulling from the LTOP selected LT outputs for the spikeThreshold LT param 
var lt_fit_output = ftv_prep.runLTfit(table,servir_ic,breakpoints,cluster_image,min_obvs); 

//make a list of names that match the bands in the output of lt fit 
var new_names = band_names.map(function(nm){
  nm = ee.String(nm); 
  return nm.cat(ee.String('_fit')); 
}); 

///////////////////////////////////////////////////////////
///Reconfigure the LT output to match SERVIR composites////
///////////////////////////////////////////////////////////
//this section could likely be rewritten to be more efficient/use less for loops but should currently be working
var years = []; // make an empty array to hold year band names
for (var i = startYear; i <= endYear; ++i) years.push(i.toString()); // fill the array with years from the startYear to the endYear and convert them to string

//rename the bands so we know which lt band they were 
var rename_bands = function(img,modifier){
  var new_names = years.map(function(y){
    y = ee.String(y); 
    return y.cat(modifier); 
  }); 
  return img.select(years,new_names); 
}; 

//convert array images to a multiband image. This will end up as a list of images. 
var FTVstacks = new_names.map(function(nm){
  nm = ee.String(nm); 
  var img = lt_fit_output.select(nm); //this is an array image with a time series
  return rename_bands(img.arrayFlatten([years],nm).set('source_band',nm),ee.String('_').cat(nm)); 
  
}); 

//convert a multiband image into an imagecollection
var bandToCollection = function(collection){
// get band names
var bands =  collection.bandNames(); 
var dayCounter = ee.List.sequence(1, bands.size()); 

// build new collection with 1 image per band
var newCollection = dayCounter.map(function(b){
  var band_name = ee.String(bands.get(ee.Number(b).subtract(1))); 
  var img = ee.Image(collection.select(band_name)); 
  var year = band_name.slice(0,4); 
    
  return img.set('year',ee.Number.parse(year)); 
  }); 
  return newCollection; 
}; 

///////////////////////////////////////////////////////////
//initialize an empty container for the imageCollections 
var collections = []; 

var lower = (ee.Number(num_bands).subtract(1)).getInfo(); 
var upper = ee.Number(num_bands).getInfo(); 


// for (var i in indices){
for (var i = 0; i < upper; i += 1){
  //convert the multiband images to imageCollections 
  collections.push(ee.ImageCollection(bandToCollection(ee.Image(FTVstacks.get(i)))));//get(indices[i])))))
}

//this for loop could maybe be replaced with the iterate function? 
//create an initialization imageCollection - this will default to the blue band 
var output = collections[0];
//snip off the first collection (blue) because its already in the start
collections = ee.List(collections).slice(1);

for (var i = 0; i < lower; i += 1){
// for (var i in short_indices){
  //use the combine function to stick each band/time series onto the previous 
  output = output.combine(ee.ImageCollection(collections.get(i)));//.get(indices[i]))); 
}

//now remove the year to mimic the band naming structure of the servir composites
output = output.map(function(img){
  var bands = img.bandNames(); 
  var new_bands = bands.map(function(b){
    b = ee.String(b); 
    //the bands are set up to have a four digit year in front of the band name so just remove that
    return b.slice(5); 
  }); 
  //for some reason the default data type is double precision float - change that to something smaller 
  return img.select(bands,new_bands).toInt16(); 
}); 

//now sort them because they come out of the map in a weird order
output = output.sort('year'); 

//export
for (var i = startYear; i <= endYear; ++i){
  var out_img = output.filter(ee.Filter.eq('year',i)).first().clip(aoi);
  var yr_str = ee.Number(i).format().getInfo(); 
  
  Export.image.toAsset({
  image:out_img, 
        description: "servir_"+yr_str+"_stabilized_"+place, 
        assetId: dest_folder+"/servir_"+yr_str+"_stabilized_"+place, 
        region:aoi, 
        scale:30, 
        maxPixels: 1e13 
      });   
} 

