async function fetchPrices() {
    const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/latest", {
        headers: { "User-Agent": "CraftingTrackerWeb/1.0" }
    });
    const json = await res.json();
    return json.data || {};
}

async function fetchVolumes() {
    const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/volumes", {
        headers: { "User-Agent": "CraftingTrackerWeb/1.0" }
    });
    const json = await res.json();
    return json.data || {};
}

async function fetchRecipes() {
    const res = await fetch("recipes.json");
    return await res.json();
}

async function getAllPotionGroups() {
    const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/mapping", {
        headers: { "User-Agent": "CraftingTrackerWeb/1.0" }
    });
    const items = await res.json();
    
    const groups = {};
    const potionRegex = /^(.+?)\((\d)\)$/;

    for (const item of items) {
        const match = item.name.match(potionRegex);
        if (match) {
            const baseName = match[1].trim();
            const dose = parseInt(match[2]);
            
            if (!groups[baseName]) {
                groups[baseName] = { name: baseName, ids: {}, limit: item.limit || 2000 };
            }
            groups[baseName].ids[dose] = item.id;
        }
    }

    return Object.values(groups).filter(p => p.ids[1] && p.ids[2] && p.ids[3] && p.ids[4]);
}

async function calculateAll() {
    document.getElementById("status").innerText = "Fetching live market, volume, & mapping data...";
    const [prices, volumes, recipes, potionList] = await Promise.all([
        fetchPrices(),
        fetchVolumes(),
        fetchRecipes(),
        getAllPotionGroups()
    ]);
    document.getElementById("status").innerText = "Updated at " + new Date().toLocaleTimeString();

    renderAssembly(prices, volumes, recipes);
    renderDecanting(prices, volumes, potionList);
}

function renderAssembly(prices, volumes, assemblyRecipes) {
    const calculatedRecipes = [];

    // Price intermediate (craftable-component) recipes first, so inputs
    // like Bandosian components use the cheapest live dismantle cost
    // instead of the GE price (which is often unbuyable).
    const intermediateCosts = {};
    for (const recipe of assemblyRecipes) {
        if (!recipe.intermediate) continue;
        let intermediateTotal = recipe.fee || 0;
        let intermediateOk = true;
        for (const input of recipe.inputs) {
            const inData = prices[input.id] || {};
            const unitPrice = inData.low || 0;
            if (unitPrice > 0) {
                intermediateTotal += unitPrice * input.qty;
            } else {
                intermediateOk = false;
                break;
            }
        }
        if (!intermediateOk) continue;
        const outputQty = recipe.output_qty || 1;
        const unitCost = Math.round(intermediateTotal / outputQty);
        const existing = intermediateCosts[recipe.output_id];
        if (!existing || unitCost < existing.unitCost) {
            // display the actual item bought (e.g. Bandos tassets), not the abstract component
            const src = recipe.inputs[0];
            intermediateCosts[recipe.output_id] = {
                unitCost: unitCost,
                sourceName: src ? src.name : recipe.name,
                sourceId: src ? src.id : null,
                sourceQtyPerUnit: src ? src.qty / outputQty : 1
            };
        }
    }

    for (const recipe of assemblyRecipes) {
        if (recipe.intermediate) continue;
        const outData = prices[recipe.output_id] || {};
        const grossSell = outData.high || 0;
        const tax = grossSell > 0 ? Math.min(Math.floor(grossSell * 0.02), 5000000) : 0;
        const netRevenue = grossSell > 0 ? grossSell - tax : 0;

        let totalCost = recipe.fee;
        let hasAllPrices = (grossSell > 0);
        const components = [];

        if (recipe.fee > 0) {
            components.push({ name: "Assembly Fee", cost: recipe.fee, qty: 1 });
        }

        for (const input of recipe.inputs) {
            let unitPrice;
            let displayName = input.name;
            const intermediate = intermediateCosts[input.id];
            if (intermediate) {
                unitPrice = intermediate.unitCost;
                const srcQty = input.qty * intermediate.sourceQtyPerUnit;
                const qtyStr = Number.isInteger(srcQty) ? String(srcQty) : String(Math.round(srcQty * 100) / 100);
                displayName = intermediate.sourceName + " x" + qtyStr + " (dismantle)";
            } else {
                const inData = prices[input.id] || {};
                unitPrice = inData.low || 0;
            }
            if (unitPrice > 0) {
                const compCost = unitPrice * input.qty;
                totalCost += compCost;
                components.push({ name: displayName, cost: compCost, qty: input.qty, id: intermediate ? intermediate.sourceId : input.id, vol: volumes[intermediate ? intermediate.sourceId : input.id] || 0 });
            } else {
                hasAllPrices = false;
                components.push({ name: displayName, cost: 0, qty: input.qty, id: intermediate ? intermediate.sourceId : input.id, vol: volumes[intermediate ? intermediate.sourceId : input.id] || 0 });
            }
        }
        if (!hasAllPrices) totalCost = null;

        if (totalCost === null) continue;

        const outVol = volumes[recipe.output_id] || 0;
        const compVols = components.filter(c => typeof c.vol === "number").map(c => c.vol);
        const bottleneck = compVols.length ? Math.min(outVol, ...compVols) : outVol;

        const profit = netRevenue - totalCost;
        const roi = totalCost > 0 ? (profit / totalCost) * 100 : 0;

        calculatedRecipes.push({
            name: recipe.name,
            outputId: recipe.output_id,
            outVol,
            bottleneck,
            req: recipe.req || "",
            totalCost,
            grossSell,
            tax,
            netRevenue,
            profit,
            roi,
            components
        });
    }

    const sortBy = document.getElementById("assembly-sort").value;
    calculatedRecipes.sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        const tierA = a.bottleneck >= 10 ? 0 : 1;
        const tierB = b.bottleneck >= 10 ? 0 : 1;
        if (tierA !== tierB) return tierA - tierB;
        if (sortBy === "roi") return b.roi - a.roi;
        return b.profit - a.profit;
    });

    let html = `<table>
        <thead>
            <tr>
                <th style="text-align:left;">Item / Component</th>
                <th>Buy Offer (Low)</th>
                <th>Sell Offer (High)</th>
                <th>GE Tax (2%)</th>
                <th>Net Revenue</th>
                <th>Net Profit</th>
                <th>ROI %</th>
                <th>24h Vol</th>
            </tr>
        </thead>
        <tbody>`;

    for (const recipe of calculatedRecipes) {
        const profitClass = recipe.profit >= 0 ? "positive" : "negative";

        let componentsHtml = "";
        for (const comp of recipe.components) {
            componentsHtml += `<tr class="sub-row">
                <td>${comp.id ? `<a href="https://prices.runescape.wiki/osrs/item/${comp.id}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline dotted;">${comp.name}</a>` : comp.name}</td>
                <td>${comp.cost > 0 ? comp.cost.toLocaleString() : "-"}</td>
                <td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>
                <td>${typeof comp.vol === "number" ? comp.vol.toLocaleString() : "-"}</td>
            </tr>`;
        }

        html += `<tr class="item-header">
            <td><a href="https://prices.runescape.wiki/osrs/item/${recipe.outputId}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline dotted;">${recipe.name}</a>${recipe.req ? `<br><span style="font-size:0.8em;color:#888;">Requires ${recipe.req}</span>` : ""}</td>
            <td>${recipe.totalCost.toLocaleString()}</td>
            <td>${recipe.grossSell.toLocaleString()}</td>
            <td>-${recipe.tax.toLocaleString()}</td>
            <td>${recipe.netRevenue.toLocaleString()}</td>
            <td class="${profitClass}">${recipe.profit.toLocaleString()} GP</td>
            <td class="roi">${recipe.roi.toFixed(1)}%</td>
            <td${recipe.bottleneck < 10 ? ' style="color:#e8a33d;" title="Bottleneck volume under 10/day"' : ""}>${recipe.outVol.toLocaleString()}</td>
        </tr>` + componentsHtml;
    }

    html += `</tbody></table>`;
    document.getElementById("assembly-output").innerHTML = html;
}

function renderDecanting(prices, volumes, potionList) {
    let html = `<table>
        <thead>
            <tr>
                <th style="text-align:left;">Potion</th>
                <th>24h Volume</th>
                <th>GE Limit</th>
                <th>4-Dose Price</th>
                <th>Best Buy Strategy</th>
                <th>Profit / 4-dose</th>
                <th>Est. 4h Limit Profit</th>
                <th>ROI %</th>
            </tr>
        </thead>
        <tbody>`;

    const results = [];

    for (const pot of potionList) {
        const p1 = prices[pot.ids[1]] ? prices[pot.ids[1]].low : null;
        const p2 = prices[pot.ids[2]] ? prices[pot.ids[2]].low : null;
        const p3 = prices[pot.ids[3]] ? prices[pot.ids[3]].low : null;
        const p4_sell = prices[pot.ids[4]] ? prices[pot.ids[4]].high : null;

        const vol4 = volumes[pot.ids[4]] || 0;

        if (!p4_sell || vol4 < 1500) continue;

        const options = [];
        if (p1) options.push({ dose: 1, unitPrice: p1, costFor4: p1 * 4 });
        if (p2) options.push({ dose: 2, unitPrice: p2, costFor4: p2 * 2 });
        if (p3) options.push({ dose: 3, unitPrice: p3, costFor4: (p3 / 3) * 4 });

        if (options.length === 0) continue;

        options.sort((a, b) => a.costFor4 - b.costFor4);
        const best = options[0];

        const grossSell = p4_sell;
        const tax = Math.min(Math.floor(grossSell * 0.02), 5000000);
        const netRevenue = grossSell - tax;
        const profit = netRevenue - best.costFor4;
        const roi = best.costFor4 > 0 ? (profit / best.costFor4) * 100 : 0;
        
        const limitProfit = profit * (pot.limit || 2000);
        const customScore = profit > 0 ? profit * Math.log10(vol4 + 1) : profit;

        results.push({
            name: pot.name,
            id4: pot.ids[4],
            volume: vol4,
            limit: pot.limit || 2000,
            p4_sell,
            bestDose: best.dose,
            bestUnitPrice: best.unitPrice,
            bestCostFor4: best.costFor4,
            profit,
            limitProfit,
            roi,
            customScore
        });
    }

    const sortBy = document.getElementById("potion-sort").value;
    results.sort((a, b) => {
        if (sortBy === "roi") return b.roi - a.roi;
        if (sortBy === "profit") return b.profit - a.profit;
        if (sortBy === "volume") return b.volume - a.volume;
        if (sortBy === "limitProfit") return b.limitProfit - a.limitProfit;
        return b.customScore - a.customScore;
    });

    for (const item of results) {
        const profitClass = item.profit >= 0 ? "positive" : "negative";
        const limitClass = item.limitProfit >= 0 ? "positive" : "negative";

        html += `<tr>
            <td style="text-align:left; font-weight:bold;"><a href="https://prices.runescape.wiki/osrs/item/${item.id4}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline dotted;">${item.name}</a></td>
            <td>${item.volume.toLocaleString()}</td>
            <td>${item.limit.toLocaleString()}</td>
            <td>${item.p4_sell.toLocaleString()} GP</td>
            <td class="best-buy">Buy (${item.bestDose})-dose @ ${Math.round(item.bestUnitPrice).toLocaleString()} GP each <span style="color:#aaa; font-size:0.85em;">(= ${Math.round(item.bestCostFor4).toLocaleString()} total)</span></td>
            <td class="${profitClass}">${Math.round(item.profit).toLocaleString()} GP</td>
            <td class="${limitClass}">${Math.round(item.limitProfit).toLocaleString()} GP</td>
            <td class="roi">${item.roi.toFixed(1)}%</td>
        </tr>`;
    }

    html += `</tbody></table>`;
    document.getElementById("decant-output").innerHTML = html;
}

calculateAll();
