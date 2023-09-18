const axios = require('axios');
const fs = require('fs');
const cron = require('node-cron');
let historicalData;
let allIds = [];
let historyLastUpdatedDate;
let buyData = JSON.parse(fs.readFileSync("./data/data.json"));
let skinIds = JSON.parse(fs.readFileSync("./data/skinIds_temp.json"));
const secret = JSON.parse(fs.readFileSync("../secret.json"));
let listings = [];
let names;

function updateHistoricalData(cb) {
    axios.get("http://csgobackpack.net/api/GetItemsList/v2/")
    .then(result => {
        //fs.writeFileSync("./data/historical.json", JSON.stringify(result.data));
        historyLastUpdatedDate = result.data.timestamp*1000;
        historicalData = result.data.items_list;
        if(cb) cb()
    })
    //.catch(error => console.error('Request failed', error.response.data));
}

function getListings(float,name, offset,cb) {
    const auth_key = secret.bitskinsAPI;
    split = name.split("(");
    if(split.length > 1) {
        split[1] = split[1].replace(" ", "-");
        name = split[0]+"("+split[1];
    }
    if(name.length > 64) return cb({list:[]});
    const body = {
        "limit": 500,
        "offset": offset,
        "where": {
            "price_to": 50*1000,
            "price_from":8*1000,
            "float_from":0,
            "float_to":1,
            "name":name,
            "type_id":[0,1,2,3,4,5,6,7]
        }
    };

    axios.post("https://api.bitskins.com/market/search/730", body, {
        "headers": {
            "content-type": "application/json",
            "x-apikey": auth_key,
        },
    })
    .then(result => {
        console.log(result.data);
        cb(result.data)
    })
    //.catch(error => console.error('Request failed', error.response.data, name.length));
}

function getAllForSkin(name,cb) {
    let allListings = [];
    
    let completed = 0;
    for(let i=0;i<3;i++) {
        getListings([0,1], name, i*500, listings => {
            for(let j=0;j<listings.list.length;j++) {
                if(!allIds.includes(listings.list[j].id)) {
                    allListings.push(listings.list[j]);
                    allIds.push(listings.list[j].id);
                }
            }
            completed++;
            if(completed === 3) return cb({items:allListings,expectedName:name});
        });
    }
}

function calculateWeighted(included, scores, multiplier, name, st, price, med, item) {
    let sum = 0;
    for(let i=0;i<included+1;i++) sum+=scores[i];
    let totalScore = sum/(included+1) * multiplier;
    let buy, htmlBuy;
    if(totalScore < 0.2) return;
    if(scores[0] == Infinity) return;
    if(scores[1] == Infinity) return;
    if(scores[2] == Infinity) return;
    if(totalScore < 0.4) {buy = "\x1b[44mWEAK BUY";htmlBuy = "<div style='background-color:cyan;color:rgb(50, 50, 50);'>WEAK BUY</div>"}
    else if(totalScore < 1.1) {buy = "\x1b[43mMODERATE BUY";htmlBuy = "<div style='background-color:rgb(190,170,0);color:rgb(50, 50, 50);'>MODERATE BUY</div>"}
    else {buy = "\x1b[41m\x1b[37mSTRONG BUY";htmlBuy = "<div style='background-color:rgb(175,0,0);color:rgb(50, 50, 50);'>STRONG BUY</div>"};
    const s1 = scores[1]>0, s2 = scores[2]>0;
    //console.log(`${buy}\x1b[0m  \x1b[100m$${(price/1000).toFixed(2)} vs ${med.toFixed(2)}\x1b[0m: ${name}  |  \x1b[32m7d✅: ${scores[0].toFixed(4)}\x1b[0m    ${s1?"\x1b[32m":"\x1b[31m"}30d${s1?"✅":"❌"}: ${scores[1].toFixed(4)}\x1b[0m    ${s2?"\x1b[32m":"\x1b[31m"}AT${s2?"✅":"❌"}: ${scores[2].toFixed(4)}\x1b[0m  |  sell time (week): ${st[0].toFixed(3)}d  sell time (month): ${st[1].toFixed(3)}d`)
    listings.push({
        'buyMessage':htmlBuy,
        'listPrice':price,
        'medianSellPrice':med,
        'item':{
            name:typeof name == "string"?item.name:(names<0?"ERROR":names[item.name]),
            id:item.id,
            price:item.price
        },
        'scoreString':`<div style='color:green;'>7d✅: ${scores[0].toFixed(4)}</div> &nbsp;&nbsp;<div style='color:${s1?"green":"red"};'>30d${s1?"✅":"❌"}: ${scores[1].toFixed(4)}</div> &nbsp;&nbsp;<div style='color:${s2?"green":"red"};'>AT${s2?"✅":"❌"}: ${scores[2].toFixed(4)}</div>`,
        'scores':scores,
        'sales':st,
        'totalScore':totalScore,
        'timestamp':new Date().getTime()
    })
}

function analyzeItem(item, expectedName) {
    if(item.name == "string" && names[item.name] !== expectedName) return 0;
    const historic = historicalData[typeof item.name == "number"?names[item.name]:item.name];
    if(historic.price === undefined) return;

    const week = historic.price['7_days'];
    const month = historic.price['30_days'];
    const at = historic.price['all_time'];
    if(week == undefined || month == undefined || at == undefined) return 0;
    
    const weekScore = (item.price/1000 - (week.median)) / -week.standard_deviation;
    const monthScore = (item.price/1000 - (month.median)) / -month.standard_deviation;
    let allTimeScore = (item.price/1000 - (at.median)) / -at.standard_deviation;
    const wSellTime = 7/week.sold;
    const mSellTime = 30/month.sold;
    if(item.price/1000 / week.median * 100 > 130) return 1;
    if(weekScore > 0) {
        if(monthScore > 0) {
            if(allTimeScore > 0) {
                calculateWeighted(2,[weekScore,monthScore,allTimeScore],1.5,item.name, [wSellTime, mSellTime], item.price, month.median, item);
            } else {
                calculateWeighted(1,[weekScore,monthScore,allTimeScore],1.25,item.name, [wSellTime, mSellTime], item.price, month.median, item);
            }
        } else {
            calculateWeighted(0,[weekScore,monthScore,allTimeScore],1,item.name, [wSellTime, mSellTime], item.price, month.median, item);
        }
    }
    return 0;
}

function analyzeAll(items,expectedName, remove) {
    if(remove === undefined) remove = false;

    items.forEach((item,i)=> {
        const res = analyzeItem(item,expectedName);
        //if(res === 1 && remove) items.splice(i,1); 
    })
}

let currentKey = buyData.keyIndex;
function doBatch(keys, size) {
    if(size == 0) return;
    getAllForSkin(keys[currentKey%keys.length],({items,expectedName}) => {
        buyData.items.push(...items.map(e=>{return{name:names.indexOf(e.name),price:e.price,id:e.id}}));
        analyzeAll(items,expectedName)
        currentKey++;
        doBatch(keys,size-1);
    });  
    buyData.keyIndex = currentKey;
    buyData.historyLastUpdated = historyLastUpdatedDate;
    fs.writeFileSync("./data/data.json", JSON.stringify(buyData), 'utf-8');
}

let currentSkinIdIndex = 0;

updateHistoricalData(() => {
    const keys = Object.keys(historicalData);
    allIds = buyData.items.map(e=>e.id);
    names = keys.sort();
    analyzeAll(buyData.items,true);
    
    // doBatch(keys, 7)
    // setInterval(()=>{doBatch(keys, 7)}, 45000)
    // cron.schedule('*/30 * * * *', ()=>{updateHistoricalData(undefined)});
});


// GET SKIN IDS

// updateHistoricalData(() => {
//     testMultiple(skinIds.map);


//     currentSkinIdIndex = skinIds.index;
//     const keys = Object.keys(historicalData);
//     doIdBatch(keys,skinIds.index);
//     currentSkinIdIndex=skinIds.index+20;
//     setInterval(()=>{doIdBatch(keys,currentSkinIdIndex)}, 50000);
//     if(currentSkinIdIndex>keys.length) console.log("finished collecting ids");
// });

function doIdBatch(keys,start) {
    let finished = 0;
    for(let i=start;i<start+20&&start+i<keys.length;i++) {
        getSkinIds(keys[i], () => {
            finished++;
            if(finished >= 20 || finished+start >= keys.length-1) {
                currentSkinIdIndex+=20;
                console.log(currentSkinIdIndex/keys.length*100,currentSkinIdIndex, keys.length);
                skinIds.index = currentSkinIdIndex;
                fs.writeFileSync("./data/skinIds_temp.json", JSON.stringify(skinIds), 'utf-8');
            }
        });
    }
    
}

function testMultiple(data) {
    let hash = {};
    const values = Object.values(data).map(e=>e.toString());
    
    for(let i=0;i<values.length;i++) {
        //console.log(values[i])
        if(Object.keys(hash).includes(values[i])) {
            hash[values[i]]++;
        } else {
            hash[values[i]] = 1;
        }
    }
    const hashKeys = Object.keys(hash);
    const dataKeys = Object.keys(data);
    for(let i=0;i<hashKeys.length;i++) {
        const key = hashKeys[i];
        let dataKey;
        for(let j=0;j<dataKeys.length;j++) {
            if(data[dataKeys[j]] == key) dataKey = dataKeys[j];
        }
        if(hash[key] > 1) console.log(key, hash[key], dataKey);
    }
}


function getSkinIds(name,cb) {
    let split = name.split("(");
    if(split.length > 1) {
        split[1] = split[1].replace(" ", "-");
        name = split[0]+"("+split[1];
    }
    if(name.length > 64) return cb({list:[]});

    const auth_key = secret.bitskinsAPI;
    const body = {
    "limit": 1,
    "offset": 0,
    "where": {
        "skin_name": name,
    }
    };

    axios.post("https://api.bitskins.com/market/search/730", body, {
    "headers": {
        "content-type": "application/json",
        "x-apikey": auth_key,
    },
    })
    .then(result => {
        if(result.data.list.length === 0) return cb();
        skinIds.map[name] = result.data.list[0].skin_id;
        cb()
    })
    .catch(error => console.error('Request failed', error.response.data));
}

function getData() {
    return {historyLastUpdated:buyData.historyLastUpdated, buys:listings, names:names};
}
module.exports.getData = getData;