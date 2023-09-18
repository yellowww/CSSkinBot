const container = document.getElementById("container");
const filter = document.querySelector("select");
function getData(cb) {
    fetch("/data")
    .then(res => res.json())
    .then(json => cb(json))
    .catch(err=>console.error(err))
}

function update() {
    const scrollY = container.scrollTop;
    container.innerHTML = ""
    getData(data => { 
        let buys = data.buys;
        if(filter.value == "profit") buys = data.buys.sort((a,b) => (b.medianSellPrice - b.listPrice /1000) - (a.medianSellPrice - a.listPrice /1000))
        else if(filter.value == "recent") buys = data.buys.sort((a,b) => b.timestamp - a.timestamp);
        else if(filter.value == "pProfit") buys = data.buys.sort((a,b) => -(a.medianSellPrice-a.listPrice/1000)/(a.listPrice/1000) - -(b.medianSellPrice-b.listPrice/1000)/(b.listPrice/1000))
        else buys = data.buys.sort((a,b) => b.totalScore - a.totalScore);
        let max = 100;
        for(let i=0;i<max;i++) {
            if(i>=buys.length) break;
            
            const buy = buys[i];
            if(new Date().getTime() - buy.timestamp > 1000*60*60*24*7) {
                max++;
                continue;
            }
            const item = buy.item;
            const e = document.createElement("a");
            e.href = `https://bitskins.com/item/csgo/${item.id}`;
            e.target = "_blank";
            e.classList.add("list-item");
            const profitP = (buy.medianSellPrice-buy.listPrice/1000)/(buy.listPrice/1000)
            e.innerHTML = `${buy.buyMessage} &nbsp;&nbsp;&nbsp; <div style="background-color:rgb(50, 100, 110);font-weight:bold;">$${(buy.listPrice/1000).toFixed(2)} vs $${(buy.medianSellPrice).toFixed(1)}&nbsp;&nbsp;=> $${(buy.medianSellPrice-buy.listPrice/1000).toFixed(2)}  (${(profitP*100).toFixed(2)}%)</div> &nbsp;&nbsp; | &nbsp;&nbsp; <a href="https://steamcommunity.com/market/listings/730/${item.name}" target="_blank" style="font-weight:bold;color:rgb(200, 192, 192);text-decoration:underline">${item.name}</a> &nbsp;&nbsp;&nbsp;&nbsp; ${buy.scoreString}<br><div style="padding-left:30vw;">Sell Time (week): <div style="font-weight:bold">${buy.sales[0].toFixed(4)}d</div>&nbsp;&nbsp;Sell Time (month): <div style="font-weight:bold">${buy.sales[1].toFixed(4)}d</div></div>`
            container.appendChild(e);
        }
        container.scrollTop = scrollY;
    });
}

setInterval(update, 10000);
update()