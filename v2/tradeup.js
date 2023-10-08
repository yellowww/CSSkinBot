const fs = require('fs');
const config = JSON.parse(fs.readFileSync("../config.json"));
const secret = JSON.parse(fs.readFileSync("../secret.json"));
const { Worker, isMainThread } = require('worker_threads');

const acceptedTypes = ['Rifle', 'Sniper Rifle', 'SMG', 'Pistol', 'Shotgun'];
const rarities = ['Covert', 'Classified', 'Restricted', 'Mil-Spec Grade', 'Industrial Grade', 'Consumer Grade'];
const itemBlacklist = ['P250 | X-Ray', 'M4A4 | Howl'];
const floatRanges = {"Factory New":[0,0.07],"Minimal Wear":[0.07,0.15], "Field-Tested":[0.15,0.38],"Well-Worn":[0.38,0.45],"Battle-Scarred":[0.45,1]}

const collections = JSON.parse(fs.readFileSync("./data/collections.json"));
const collectionKeys = Object.keys(collections);
const floatCaps = JSON.parse(fs.readFileSync("./data/floatCaps.json"));
const collectionHash = generateCollectionHash(collections);


let tradeupSampleSlots = [4,2,2,2]; // after each iteration finishes, incresase exponent while starting new analysis stacks with profitable results from previous iteration
let minVolumeBuy = 20;
let maxPrice = 20;
let profitable = [];

// recurive analysis variables
let orderedSteam;
let orderedByNameSteam;
let threads = 20;
let tradeupSampleSlotIndex;

let maxIterationMarker;
let lookupTable;

function initFullAnalysis(rarity, market, st) {
    const {ordered, orderedByName} = getOrganizedMarket(market);
    maxIterationMarker = getMaxIterationMarker(ordered,rarity,st);
    lookupTable = generateItemLookupTable(ordered, rarity,st,maxIterationMarker);
    tradeupSampleSlotIndex = 0;
    profitable = [];
    doFullAnalysis(rarity, market, st, ordered, orderedByName);
}

function doFullAnalysis(rarity, market, st, ordered, orderedByName) {

    let thisIterationProfitable = [];
    let completed = 0;
    for(let i=0;i<threads;i++) {
        const worker = new Worker("./tradeupWorker.js",{workerData:{i:i,n:threads,tradeupSampleSlotIndex:tradeupSampleSlotIndex,st:st,prevData:profitable,ordered:ordered,tradeupSampleSlots:tradeupSampleSlots,rarity:rarity,collections:collections,collectionKeys:collectionKeys,lookupTable:lookupTable,orderedByName:orderedByName}});
        worker.on('message',(message) => {
            thisIterationProfitable.push(...JSON.parse(message));
            completed++;
            if(completed == threads) {
                profitable = thisIterationProfitable;
                const sorted = profitable.sort((a,b)=>b.profit-a.profit);
                console.log("finished iteration");
                console.log(sorted.length);
                console.log(sorted[100].inputs.map(e=>e.median),sorted[1].inputs.map(e=>e.item.name),sorted[100].flatOutcomeNames.map(e=>orderedByName[e]),sorted[100].flatOutcomeNames, sorted[100].profit);
                tradeupSampleSlotIndex++;
                if(tradeupSampleSlotIndex>=tradeupSampleSlots.length) return;
                doFullAnalysis(rarity,market,st, ordered, orderedByName);
            }
        });
    }
}

function getMaxIterationMarker(ordered,rarityInt,st) {
    let ticker = 0;
    for(let i = 0;i<collectionKeys.length;i++) {
        const collection = ordered[collectionKeys[i]];
        for(let wear=0;wear<collection[rarityInt].length;wear++) {
            if(collection[rarityInt][wear][st].min.median === null) continue;
            if(collection[rarityInt-1][wear][st].all.length === 0) continue;
            ticker++;
        }
    }
    return ticker;
}

function generateItemLookupTable(ordered,rarityInt,st, max) {
    console.log("Tradeup: Generating lookup table.")
    const lookupTable = new Array(max);
    for(let j=0;j<max;j++) {
        let foundItem = false;
        let ticker = 0;
        for(let i = 0;i<collectionKeys.length;i++) {
            const collection = ordered[collectionKeys[i]];
            if(foundItem) break;
            for(let wear=0;wear<collection[rarityInt].length;wear++) {
                if(collection[rarityInt][wear][st].min.median === null) continue;
                if(collection[rarityInt-1][wear][st].all.length === 0) continue;
                if(ticker===j) {
                    foundItem = true;
                    lookupTable[j] = {
                        possibleOutcomes: collection[rarityInt-1][wear][st].all,
                        input: collection[rarityInt][wear][st].min
                    }
                    break;
                }

                ticker++;
            }
        }
        if(!foundItem) console.log("ERROR", ticker,j);
    }
    return lookupTable;
}

function getOrganizedMarket(marketName) {
    if(marketName === "steam") return {ordered:orderedSteam,orderedByName:orderedByNameSteam};
}

function organizeItems() {
    const pricesBS = JSON.parse(fs.readFileSync(config.market_data_path + "/bitskins/tenDayAverages.json"));
    const pricesSkinport = JSON.parse(fs.readFileSync(config.market_data_path + "/skinport/marketHistory.json"));
    const pricesSteam = JSON.parse(fs.readFileSync(config.market_data_path + "/steam/marketHistory.json"));

    const spKeys = pricesSkinport.data.map(e=>e.market_hash_name);
    const steamKeys = Object.keys(pricesSteam.data);

    let compiledData = [];
    console.log("Tradeup: Building price map");
    for(let i=0;i<steamKeys.length;i++) {
        const itemData = compileItemData(steamKeys[i],pricesSteam,pricesBS,pricesSkinport,spKeys)
        if(itemData) compiledData.push(itemData);
    }
    orderedByNameSteam = organizeByItemName(compiledData, 'steam');
    orderedSteam = organizeByCollection(compiledData, 'steam');
    
    initFullAnalysis(1,"steam", "statTrak");
}

function organizeByItemName(compiledData, market) {
    const hash = {};
    for(let i=0;i<compiledData.length;i++) {
        hash[compiledData[i].name] = compiledData[i].prices[market];
    }
    fs.writeFileSync("./temp.json", Object.keys(hash).join("\n"), 'utf-8');
    return hash;
}

function organizeByCollection(compiledData,market) {
    console.log("Tradeup: Sorting price map");
    const hash = {};
    for(let i=0;i<Object.keys(collections).length;i++) {
        const rarityList = new Array(rarities.length);
        for(let j=0;j<rarityList.length;j++) {
            const wearList = new Array(Object.keys(floatRanges).length);
            for(let k=0;k<Object.keys(floatRanges).length;k++) {
                wearList[k] = {"wear":Object.keys(floatRanges)[k],"norm":{min:{median:null},all:[]},"statTrak":{min:{median:null},all:[]}};
            }
            rarityList[j] = wearList;
        }
        hash[Object.keys(collections)[i]] = rarityList;
    }
    
    for(let i=0;i<compiledData.length;i++) {
        const thisItem = compiledData[i];
        const rarityInt = thisItem.rarityInt;
        const qualityInt = Object.keys(floatRanges).indexOf(thisItem.wear);
        const collection = thisItem.collection;
        const st = thisItem.statTrak;
        const prevMin = hash[collection][rarityInt][qualityInt][st?"statTrak":"norm"].min.median;
        const thisPrice = thisItem.prices[market];
        if(thisPrice.median === null) continue;
        hash[collection][rarityInt][qualityInt][st?"statTrak":"norm"].all.push({median:thisPrice.median,volume:thisPrice.volume,item:thisItem});
        if((prevMin === null || thisPrice.median < prevMin) && thisPrice.median < maxPrice) hash[collection][rarityInt][qualityInt][st?"statTrak":"norm"].min = {median:thisPrice.median,volume:thisPrice.volume,item:thisItem};
    }
    return hash;
}

function compileItemData(itemName, steam,bs,sp, spKeys) {
    itemName
    if(steam.data[itemName].tradable !== 1) return false;
    if(steam.data[itemName].souvenir === 1) return false;
    if(!acceptedTypes.includes(steam.data[itemName].weapon_type)) return false;
    const wear = itemName.split(" (").length>1?itemName.split(" (")[itemName.split(" (").length-1].split(")")[0]:null;
    if(wear === null) return false;

    const statTrak = itemName.includes("StatTrak™");
    let plainName = itemName.split(" (");
    plainName.pop();
    plainName = plainName.join(" (");
    const nameWithoutWear = plainName+"";
    plainName = plainName.replace("StatTrak™ ","");
    if(itemBlacklist.includes(plainName)) return false;
    const rarity = steam.data[itemName].rarity;
    const collection = collectionHash[plainName.replace(/%27/g,"'").replace(/&#39/g, "'")];
    const fullItemFloatCaps = floatCaps[plainName]?floatCaps[plainName]:[0,1];
    const floatRange = floatRanges[wear];
    if(floatRange[0]<fullItemFloatCaps[0]) floatRange[0] = fullItemFloatCaps[0];
    if(floatRange[1]>fullItemFloatCaps[1]) floatRange[1] = fullItemFloatCaps[1];
    const bsValues = Object.values(bs.data);
    const bsIndex = bsValues.map(e=>e.name).indexOf(itemName)
    const spPrices = sp.data[spKeys.indexOf(itemName)];
    const steamExists = steam.data[itemName].price !== undefined && steam.data[itemName].price['30_days'] !== undefined;
    const bsExists = bsValues[bsIndex] !== undefined;
    const spExists = spPrices !== undefined;
    
    return {
        name:itemName,
        plainName:plainName,
        statTrak:statTrak,
        nameWithoutWear:nameWithoutWear,
        collection:collection,
        floatRange:fullItemFloatCaps,
        wear:wear,
        rarity:rarity,
        rarityInt:rarities.indexOf(rarity),
        prices: {
            steam: {
                median:steamExists?steam.data[itemName].price['30_days'].median*steam.dollarConversion:null,
                volume:steamExists?parseInt(steam.data[itemName].price['30_days'].sold):null
            },
            bitskins: {
                median:bsExists?bsValues[bsIndex].estMedian*bs.dollarConversion:null,
                volume:bsExists?bsValues[bsIndex].volume*3:null
            },
            skinport: {
                median:spExists?spPrices['last_30_days'].median*sp.dollarConversion:null,
                volume:spExists?spPrices['last_30_days'].volume:null
            }
        }
    }
} 


function generateCollectionHash() {
    const hash = {};
    for(let i=0;i<Object.keys(collections).length;i++) {
        const collectionName = Object.keys(collections)[i];
        for(let j=0;j<collections[collectionName].length;j++) hash[collections[collectionName][j]] = collectionName;
    }
    return hash;
}


organizeItems()