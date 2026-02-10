// Map Script for Bangladesh Election 2026
import firebaseConfig from './firebase_config.js';

let currentLiveResults = {}; // Global store for hover handlers
let seatMap = new Map();
let tooltip;

document.addEventListener('DOMContentLoaded', async () => {
    const mapContainer = d3.select("#map");
    tooltip = d3.select("#tooltip");

    try {
        // Load data concurrently
        const [svgXml, electionData] = await Promise.all([
            d3.xml("map_constituencies.svg"),
            d3.json("election_data.json")
        ]);

        console.log("SVG and Election Data loaded.");

        // Append SVG to the container
        const svgNode = svgXml.documentElement;
        mapContainer.node().appendChild(svgNode);

        // Make the SVG responsive
        const svgElement = mapContainer.select("svg");
        svgElement
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("preserveAspectRatio", "xMidYMid meet");

        // 1. Force colors on ALL map shapes that have a fill
        svgElement.selectAll("path, polygon, rect, circle, ellipse, polyline")
            .filter(function () {
                const fill = d3.select(this).attr("fill");
                return fill && fill !== "none" && fill !== "transparent";
            })
            .style("fill", "var(--map-fill)")
            .style("stroke", "var(--map-stroke)")
            .style("stroke-width", "0.5px");

        // 2. Specialized handling for inset boundaries
        svgElement.selectAll("rect, circle, [stroke='#fcb92d']")
            .style("stroke", "var(--accent)")
            .style("stroke-width", "2.5px");

        // 3. Ensure frames have no fill
        svgElement.selectAll("rect, circle")
            .style("fill", "none");

        // Process Election Data
        Object.values(electionData.divisions || {}).forEach(divisionSeats => {
            divisionSeats.forEach(seat => {
                const safeName = normalize(seat.seat_name);
                seatMap.set(safeName, seat);
            });
        });

        // Apply interactivity
        const constituencies = svgElement.selectAll(".constituency-area");
        attachInteractivity(constituencies);

        // --- Live Results Logic ---
        initFirebase();

    } catch (error) {
        console.error("Error loading map data:", error);
    }
});

/**
 * Shared function to normalize names for mapping
 */
function normalize(str) {
    if (!str) return '';
    return str.replace(/[''""’“”]/g, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Attach mouse events to map elements
 */
function attachInteractivity(constituencies) {
    constituencies
        .on("mouseover", function (event, d) {
            const constituencyName = d3.select(this).attr("data-name");
            if (!constituencyName) return;

            const safeName = normalize(constituencyName);
            const seatData = seatMap.get(safeName);
            const liveResult = currentLiveResults[constituencyName] || currentLiveResults[safeName];

            let tooltipContent = `<span class="tooltip-title">${constituencyName}</span>`;

            if (liveResult) {
                tooltipContent += `<br><span class="tooltip-info" style="color:#fbbf24; font-weight:bold;">WINNER: ${liveResult.candidate}</span>`;
                tooltipContent += `<br><span class="tooltip-info">${liveResult.party}</span>`;
            } else if (seatData) {
                tooltipContent += `<br><span class="tooltip-info">District: ${seatData.district_name}</span>`;
                tooltipContent += `<br><span class="tooltip-info">Division: ${seatData.division_name}</span>`;
            }

            const selection = d3.select(this).transition().duration(150);
            if (!liveResult) selection.style("fill", "var(--map-hover)");

            selection.style("stroke", "var(--text-primary)").style("stroke-width", "2px");

            tooltip.style("opacity", 1)
                .html(tooltipContent)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function () {
            const constituencyName = d3.select(this).attr("data-name");
            const safeName = normalize(constituencyName);
            const liveResult = currentLiveResults[constituencyName] || currentLiveResults[safeName];

            const originalStroke = d3.select(this).attr("stroke");
            const isSpecial = originalStroke === "#fcb92d";

            d3.select(this)
                .transition().duration(150)
                .style("fill", liveResult ? liveResult.color : "var(--map-fill)")
                .style("stroke", isSpecial ? "var(--accent)" : (liveResult ? "#ffffff" : "var(--map-stroke)"))
                .style("stroke-width", isSpecial ? "2px" : (liveResult ? "1px" : "0.5px"));

            tooltip.style("opacity", 0);
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("click", function (event) {
            const constituencyName = d3.select(this).attr("data-name");
            if (!constituencyName) return;
            const url = `candidate_view.html?district=${encodeURIComponent(constituencyName)}&type=constituency`;
            window.open(url, "CandidateWindow", "width=900,height=800,scrollbars=yes");
        });
}

/**
 * Shared function to update map and ticker with data object
 */
function updateMapWithData(liveData) {
    currentLiveResults = liveData;

    d3.selectAll(".constituency-area").each(function () {
        const name = d3.select(this).attr("data-name");
        const safeName = normalize(name);
        const result = liveData[name] || liveData[safeName];
        if (result) {
            d3.select(this)
                .attr("data-has-winner", "true")
                .style("fill", result.color)
                .style("stroke-width", "1px")
                .style("stroke", "#ffffff");
        }
    });

    const tickerContent = document.getElementById('ticker-content');
    if (!tickerContent) return;

    const winners = Object.entries(liveData)
        .filter(([name]) => name !== "Verification")
        .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

    if (winners.length > 0) {
        tickerContent.innerHTML = winners.map(([name, data]) => `
            <div class="winner-item">
                <div class="dot" style="background:${data.color}"></div>
                <span class="winner-constituency">${name}:</span>
                <span class="winner-name">${data.candidate} (${data.party})</span>
            </div>
        `).join('');
    } else {
        tickerContent.innerHTML = "Waiting for results...";
    }
}

/**
 * Initialize Firebase and listen for real-time updates
 */
function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.warn("Firebase SDK not loaded yet.");
        return;
    }

    if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
        console.log("Firebase not configured. Using polling mode.");
        fetchLiveResults();
        setInterval(fetchLiveResults, 5000);
        return;
    }

    try {
        firebase.initializeApp(firebaseConfig);
        const db = firebase.database();
        db.ref('live_results').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) updateMapWithData(data);
        });
    } catch (error) {
        console.error("Firebase init failed:", error);
        fetchLiveResults();
        setInterval(fetchLiveResults, 5000);
    }
}

async function fetchLiveResults() {
    try {
        const res = await fetch('live_results.json?t=' + Date.now());
        if (!res.ok) throw new Error("Local results not found");
        const liveData = await res.json();
        updateMapWithData(liveData);
    } catch (err) {
        console.warn("Local fetch failed:", err.message);
    }
}
