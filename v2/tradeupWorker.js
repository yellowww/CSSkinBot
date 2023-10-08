const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const floatRanges = {"Factory New":[0,0.07],"Minimal Wear":[0.07,0.15], "Field-Tested":[0.15,0.38],"Well-Worn":[0.38,0.45],"Battle-Scarred":[0.45,1]}
const floatKeys = Object.keys(floatRanges);

const ordered = workerData.ordered;

const collections = workerData.collections;
const collectionKeys = workerData.collectionKeys;
const lookupTable = workerData.lookupTable;
const orderedByName = workerData.orderedByName;
const tradeUpSampleSlotIndex = workerData.tradeupSampleSlotIndex;
const tradeupSampleSlots = workerData.tradeupSampleSlots[tradeUpSampleSlotIndex];
const prevSlotSum = getPrevSlotSum();

let maxI = Math.ceil((lookupTable.length)**tradeupSampleSlots/workerData.n);

let prevData = workerData.prevData;
let currentAnalysisStack;
let possibleOutcomes;
let iterationMarkers;
let placeIteration;
let profitable = [];

if(tradeUpSampleSlotIndex == 0) fullAnalysis();
else initPartialAnalysis();

function fullAnalysis() {
    currentAnalysisStack = new Array(prevSlotSum).fill(null);
    iterationMarkers = new Array(tradeupSampleSlots).fill(0);
    iterationMarkers[0] = Math.floor(lookupTable.length/workerData.n*workerData.i);
    possibleOutcomes = new Array(prevSlotSum).fill(null);
    placeIteration = 0;
    for(let i=0;i<maxI;i++) {
        analysisIteration(workerData.rarity, "norm", "steam",0);
        if(profitable.length > 1500) {
            profitable = profitable.sort((a,b)=>a.profit-b.profit);
            profitable.splice(0,750);
        }
        //if(i%1e8==0) console.log((i/maxI*100).toFixed(2)+"% done")
        if(placeIteration == -1 || iterationMarkers[0] > Math.floor(lookupTable.length/workerData.n*(workerData.i+1))) break;
    }
    //if(profitable.length == 0) return;
    //const sorted = profitable.sort((a,b)=>b.profit-a.profit);
    parentPort.postMessage(JSON.stringify(profitable));
    //console.log(sorted[0].inputs.map(e=>e.item.name),sorted[0].outcomes, sorted[0].profit);
}

function initPartialAnalysis() {
    console.log('started partial')
    const step = Math.ceil(prevData.length / workerData.n);
    const max = step*(workerData.i+1);
    for(let i = step*workerData.i; i<max;i++) {
        if(prevData[i] == undefined) break;
        partialAnalysis(prevData[i]);
        if(profitable.length > 800) {
            profitable = profitable.sort((a,b)=>a.profit-b.profit);
            profitable.splice(0,profitable.length-400);
        }
       
    }
    console.log(profitable.length);
    //const sorted = profitable.sort((a,b)=>b.profit-a.profit);
    parentPort.postMessage(JSON.stringify(profitable));
    //if(workerData.i == 5) console.log(sorted[0].inputs.map(e=>e.median),sorted[0].inputs.map(e=>e.item.name),sorted[0].flatOutcomeNames.map(e=>orderedByName[e]),sorted[0].flatOutcomeNames,sorted[0].outcomes, sorted[0].profit);
}

function partialAnalysis(currentPrevData) {
    currentAnalysisStack = new Array(prevSlotSum).fill(null);
    for(let i=tradeupSampleSlots;i<prevSlotSum;i++) currentAnalysisStack[i] = currentPrevData.inputs[i-tradeupSampleSlots];
    iterationMarkers = new Array(tradeupSampleSlots).fill(0);
    possibleOutcomes = new Array(prevSlotSum).fill(null);
    for(let i=tradeupSampleSlots;i<prevSlotSum;i++) possibleOutcomes[i] = currentPrevData.outcomes[i-tradeupSampleSlots];
    placeIteration = 0;
    maxI = 1e12;
    for(let i=0;i<maxI;i++) {
        analysisIteration(workerData.rarity, "statTrak", "steam",0);
        if(placeIteration == -1) {break;};
    };

}

function getPrevSlotSum() {
    let sum=0;
    for(let i=0;i<=tradeUpSampleSlotIndex;i++) {
        sum += workerData.tradeupSampleSlots[i];
    }
    
    return sum;
}


function analysisIteration(rarityInt,st, market) {
    if(iterationMarkers[placeIteration]>=lookupTable.length) {
        iterationMarkers[placeIteration] = 0;
        iterationMarkers[placeIteration-1]++;
        placeIteration--;
    } else {
        const currentItem = workerData.lookupTable[iterationMarkers[placeIteration]]
        possibleOutcomes[placeIteration] = currentItem.possibleOutcomes;
        currentAnalysisStack[placeIteration] = currentItem.input;
        if(placeIteration == tradeupSampleSlots-1) {    
           // if(tradeUpSampleSlotIndex == 0) analyseStack();
           // else for(let i=0;i<possibleOutcomes.length;i++) console.log(possibleOutcomes[i]);
           analyseStack();
        };
        if(placeIteration == tradeupSampleSlots-1) iterationMarkers[placeIteration]++;
        else placeIteration++;
    }
    
}

function analyseStack() {
    let medianOutcomeSum = 0;
    let medianInputSum = 0;
    let floatSum = 0;
    const flatOutcomes = [];
    const newOutcomeNames = [];
    const flatOutcomeNames = [];
    for(let i=0;i<possibleOutcomes.length;i++) flatOutcomes.push(...possibleOutcomes[i]);
    for(let i=0;i<currentAnalysisStack.length;i++) {medianInputSum += currentAnalysisStack[i].median;floatSum+=wearStringToFloat(currentAnalysisStack[i].item.wear)};
    for(let i=0;i<flatOutcomes.length;i++) newOutcomeNames.push(flatOutcomes[i].item.nameWithoutWear+" ("+getWearFromFloat(floatSum / currentAnalysisStack.length,flatOutcomes[i].item.floatRange)+")")
    for(let i=0;i<newOutcomeNames.length;i++) if(orderedByName[newOutcomeNames[i]] == undefined) return;
    for(let i=0;i<flatOutcomes.length;i++) {medianOutcomeSum += orderedByName[newOutcomeNames[i]].median;flatOutcomeNames.push(newOutcomeNames[i])};
    medianOutcomeSum /= flatOutcomes.length;
    medianOutcomeSum /= 10/prevSlotSum;
    //let sorted;
    //if(tradeUpSampleSlotIndex == 1) sorted = {inputs:JSON.parse(JSON.stringify(currentAnalysisStack)),outcomes:JSON.parse(JSON.stringify(possibleOutcomes)),flatOutcomeNames:flatOutcomeNames, profit:medianOutcomeSum/medianInputSum, avgFloat:floatSum / currentAnalysisStack.length,os:medianOutcomeSum,t:10/tradeupSampleSlots}
    //if(tradeUpSampleSlotIndex == 1) console.log(sorted.inputs.map(e=>e.median),sorted.inputs.map(e=>e.item.name),sorted.flatOutcomeNames.map(e=>orderedByName[e]),sorted.flatOutcomeNames, sorted.profit);
    if(medianOutcomeSum/medianInputSum>1.02) profitable.push({inputs:JSON.parse(JSON.stringify(currentAnalysisStack)),outcomes:JSON.parse(JSON.stringify(possibleOutcomes)),flatOutcomeNames:flatOutcomeNames, profit:medianOutcomeSum/medianInputSum, avgFloat:floatSum / currentAnalysisStack.length,os:medianOutcomeSum,t:10/tradeupSampleSlots})
}

function getWearFromFloat(avgFloat, caps) {
    const float = (caps[1]-caps[0])*avgFloat + caps[0];
    for(let i=0;i<floatKeys.length;i++) {
        const fr = floatRanges[floatKeys[i]];
        if(fr[0] < float && fr[1] > float) return floatKeys[i];
    }
    return null;
}

function wearStringToFloat(str) {
    const range = floatRanges[str];
    return ((range[1]-range[0])*0.7)+range[0]
}