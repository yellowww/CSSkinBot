let historicalData;
const axios = require('axios');
const secret = JSON.parse(fs.readFileSync("../secret.json"));
const fs = require('fs');

function getData(cb) {
    axios.get("http://csgobackpack.net/api/GetItemsList/v2/")
    .then(result => {
        //fs.writeFileSync("./data/historical.json", JSON.stringify(result.data));
        historyLastUpdatedDate = result.data.timestamp*1000;
        historicalData = result.data.items_list;
        if(cb) cb()
    })
    .catch(error => console.error('Request failed', error.response.data));
}

function getDataBS(i,cb) {
    const auth_key = secret.bitskinsAPI;
    const body = {
        "app_id": 730,
        "skin_id": i,
        "date_from": "2023-08-01",
        "date_to": "2023-09-17"
      };
      
      axios.post("https://api.bitskins.com/market/pricing/summary", body, {
        "headers": {
          "content-type": "application/json",
          "x-apikey": auth_key,
        },
      })
      .then(result => console.log('Request success', result.data))
}




function organizeItems(collectionData, items) {
    
}

function doBatch(startI) {
    for(let i=startI;i<startI+40;i++) {
        getDataBS(i);
    }
}

//getDataBS(12511);

let startIndex = 41;
// doBatch(1)
// setInterval(() => {
//     doBatch(startIndex);
//     startIndex+=40;
// },15000);

// getDataBS(() => {
//     const keys = Object.keys(historicalData)
//     console.log(historicalData[keys[500]]);
// })