"use strict";

const FILE_DOWNLOAD_URL = "plugin/octoprint_accelerometer/download";
const DATA_SET_URL = "plugin/octoprint_accelerometer/get_data_listing";
const DIV_ID_DATA_SET_VIS = "tab_plugin_octoprint_data_set_vis";
const DIV_ID_ACCELERATION_VIS = "tab_plugin_octoprint_acceleration_vis";
const DIV_ID_FFT_VIS = "tab_plugin_octoprint_fft_vis";

class OctoAxxelDataSetVis {
    // blueprint: https://observablehq.com/@d3/indented-tree?intent=fork

    /**
     * @param {str} dataSetUrl - URL for GET request, i.e. "plugin/octoprint_accelerometer/get_data_listing"
     * @return {object}
     */
    async fetchData(dataSetUrl) {
        const response = await fetch(dataSetUrl);
        const rawData = await response.json();
        const rootNode = rawData["data_sets"]

        // flatten data from structured to hierarchy (dict of "name", "children"): https://d3js.org/d3-hierarchy/hierarchy#hierarchy
        // also append node attributes to "data" of each hierarchy node
        const runs = [];
        for (const runId in rootNode) {
            const runNode = rootNode[runId];
            const sequences = [];
            for (const sequenceId in runNode) {
                const sequenceNode = runNode[sequenceId];
                const streams = [];
                for (const streamId in sequenceNode) {
                    const streamNode = sequenceNode[streamId];
                    const ffts = [];
                    for (const fftsId in streamNode["fft"]) {
                        const fftNode = streamNode["fft"][fftsId];
                        const fftNodeText = "ax: " + fftNode["fft_axis"] + " f: " + fftNode["sequence_frequency_hz"] + "Hz zeta: " + fftNode["sequence_zeta_em2"] * 0.01;
                        ffts.push({name: fftNodeText, data: {"fft": fftNode}});
                    }
                    const streamNodeText = "ax: " + streamNode["sequence_axis"] + " f: " + streamNode["sequence_frequency_hz"] + "Hz zeta: " + streamNode["sequence_zeta_em2"] * 0.01;
                    streams.push({name: streamNodeText, children: ffts, data: {"stream": streamNode}});
                }
                sequences.push({name: sequenceId, children: streams, data: {"series": "-"}});
            }
            runs.push({name: runId, children: sequences, data: {"run": "-"}});
        }
        const data = {name: "/", children: runs, data: {"root": "-"}};
        return data;
    }

    async computeChart(data) {
        const format = d3.format("");
        const nodeSize = 17;
        const root = d3.hierarchy(data).eachBefore((i => d => d.index = i++)(0));
        const nodes = root.descendants();
        const width = 220;
        const height = (nodes.length + 1) * nodeSize;

        const constColumns = [
            { label: "/", x: "1em" },
            { label: "Run", x: "4em" },
            { label: "Seq.", x: "6.5em" },
            { label: "Stream", x: "10.5em" },
            { label: "FFT", x: "13em" },
        ];

        const computedColumns = [
            {
                label: "Count",
                value: d => d.children ? 0 : 1,
                format: (value, d) => d.children ? format(value) : "-",
                x: "20em"
            }
        ];

        const svg = d3.create("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [-nodeSize / 2, -nodeSize * 3 / 2, width, height])
            .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif; overflow: visible;");

        const link = svg.append("g")
            .attr("fill", "none")
            .attr("stroke", "#999")
        .selectAll()
        .data(root.links())
        .join("path")
            .attr("d", d => `
                M${d.source.depth * nodeSize},${d.source.index * nodeSize}
                V${d.target.index * nodeSize}
                h${nodeSize}
          `);

        const node = svg.append("g")
            .selectAll()
            .data(nodes)
            .join("g")
                .attr("transform", d => `translate(0,${d.index * nodeSize})`);

        node.append("circle")
            .attr("cx", d => d.depth * nodeSize)
            .attr("r", 2.5)
            .attr("fill", d => d.children ? null : "#999");

        node.append("text")
            .attr("dy", "0.32em")
            .attr("x", d => d.depth * nodeSize + 6)
            .attr("filename", d => {
                if ("stream" in d.data.data) return d.data.data.stream.filename_no_ext + "."+ d.data.data.stream.file_extension;
                if ("fft" in d.data.data) return d.data.data.fft.filename_no_ext + "."+ d.data.data.fft.file_extension;
                return undefined;})
            .attr("nodeType", d => {
                if ("stream" in d.data.data) return "stream";
                if ("fft" in d.data.data) return "fft";
                return undefined;})
            .text(d => d.data.name)
            .on("pointerenter", event => event.target.setAttribute("style", "font-weight:bold;cursor: pointer;"))
            .on("pointerleave", event => event.target.setAttribute("style", "font-weight:normal;cursor: pointer;"))
            .on("click", event => {
                const fileName = event.target.getAttribute("filename");
                const nodeType = event.target.getAttribute("nodeType");
                if (nodeType === "stream") {
                    console.log("plotting acceleration: " + fileName);
                    (async () => new OctoAxxelAccelerationVis().plot(fileName))();
                }
                else if (nodeType === "fft") { console.log("TODO: plotting FFT"); }
            });

        node.append("title")
            .text(d => {
                const path = d.ancestors().reverse().map(d => d.data.name);
                let text = (path.length >= 2) ? "run: " + path[1] : "";
                text += (path.length >= 3) ? " sequence: " + path[2] : "";
                text += (path.length >= 4) ? " stream: " + path[3] : "";
                text += (path.length >= 5) ? " fft: " + path[4] : "";
                return text;
                });

        for (const {label, value, format, x} of computedColumns) {
            svg.append("text")
                .attr("dy", "0.32em")
                .attr("y", -nodeSize)
                .attr("x", x)
                .attr("text-anchor", "end")
                .attr("font-weight", "bold")
                .text(label);

            node.append("text")
                .attr("dy", "0.32em")
                .attr("x", x)
                .attr("text-anchor", "end")
                .attr("fill", d => d.children ? null : "#555")
                .text(d => d.children ? d.children.length : "-");
        }

        for (const {label, value, format, x} of constColumns) {
            svg.append("text")
                .attr("dy", "0.32em")
                .attr("y", -nodeSize)
                .attr("x", x)
                .attr("text-anchor", "end")
                .attr("font-weight", "bold")
                .text(label);
        }

        return svg.node();
    }

    async plot() {
        const data = await this.fetchData(DATA_SET_URL);
        const chart = await this.computeChart(data);
        document.querySelector("#" + DIV_ID_DATA_SET_VIS).replaceChildren(chart);
    }
}

class OctoAxxelAccelerationVis {
    // blueprints:
    //  - mouse events: https://observablehq.com/@d3/multi-line-chart/2?intent=fork
    //  - simple line chart: https://observablehq.com/@d3/line-chart/2?intent=fork
    //  - zoom: https://observablehq.com/@d3/zoomable-bar-chart?intent=fork

    /**
     * @param {str} fileUrl - URL of tabular separated file, i.e. "plugin/octoprint_accelerometer/download/axxel-30f9c95c-20231127-235625233-s000-ax-f010-z015.tsv"
     * @param {char} separator - tabular separator (single character)
     * @return {[{seq: float, sample: float, x: float, y: float, z: float}]}
     */
    async fetchData(fileUrl, separator = " ") {
        const text = await d3.text(fileUrl);

        // parse meta data which is the very last line of a complete stream
        let meta = undefined;
        const lines = text.split("\n");
        for (let idx = lines.length - 1; idx > lines.length - 3; idx--) {
            const line = lines[idx];
            if (line.startsWith("#")) {
                try {
                    let metaStr = line.replace(/(^.*#\s*)/, "");
                    meta = JSON.parse(metaStr);
                    const odrToFloat = (odr) => parseFloat(odr.replace(/(^ODR)/, ""));
                    meta.rate = odrToFloat(meta.rate);
                    break;
                } catch {
                    console.error("failed to parse metadata from " + fileUrl);
                }
            }
        }

        const dsv = d3.dsvFormat(" ").parse(text, (line) => {
                return {
                    seq: parseFloat(line.seq),
                    sample: parseFloat(line.sample),
                    timestamp_ms: parseFloat(line.sample) * 1000 / meta.rate,
                    x: parseFloat(line.x),
                    y: parseFloat(line.y),
                    z: parseFloat(line.z),
                };
            }
        );

        return dsv;
    }

    /**
     * @param {[{seq: float, sample: float, x: float, y: float, z: float}]}: data - chart data to plot
     */
    async computeChart(data) {
        const format = d3.format("+r");
        const width = 640;
        const height = 400;
        const marginTop = 20;
        const marginRight = 20;
        const marginBottom = 30;
        const marginLeft = 40;

        // declare the x scale (time domain)
        const xScale = d3.scaleLinear()
            .domain(d3.extent(data, d => d.timestamp_ms)).nice()
            .range([marginLeft, width - marginRight]);
        const xAxis = d3.axisBottom(xScale).ticks(width / 80, format).tickSizeOuter(0);

        // declare the y scale (acceleration domain)
        const yScale = d3.scaleLinear()
            .domain([d3.min(data, d => Math.min(d.x, d.y, d.z)), d3.max(data, d => Math.max(d.x, d.y, d.z))]).nice()
            .range([height - marginBottom, marginTop]);
        const yAxis = d3.axisLeft(yScale).ticks(height / 40, format)

        // create the SVG container
        const svg = d3.create("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height])
            .attr("style", "max-width: 100%; height: auto; overflow: visible; font: 10px sans-serif;");

        // time axis
        svg.append("g")
            .attr("transform", `translate(0,${height - marginBottom})`)
            .call(xAxis)
            .call(g => g.append("text")
                .attr("x", width / 2)
                .attr("y", marginBottom )
                .attr("fill", "currentColor")
                .attr("text-anchor", "start")
                .text("time [ms] →"));

        // acceleration axis
        svg.append("g")
            .attr("transform", `translate(${marginLeft},0)`)
            .call(yAxis)
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line").clone()
                .attr("x2", width - marginLeft - marginRight)
                .attr("stroke-opacity", 0.1))
            .call(g => g.append("text")
                .attr("x", -marginLeft)
                .attr("y", 10)
                .attr("fill", "currentColor")
                .attr("text-anchor", "start")
                .text("↑ acc [mg]"));

        // draw the lines
        const xAccelerationPath = d3.line(d => xScale(d.timestamp_ms), d => yScale(d.x));
        const yAccelerationPath = d3.line(d => xScale(d.timestamp_ms), d => yScale(d.y));
        const zAccelerationPath = d3.line(d => xScale(d.timestamp_ms), d => yScale(d.z));

        const pathAccX = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "Tomato")
            .attr("stroke-width", 1.5)
            .attr("d", xAccelerationPath(data));

        const pathAccY = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "MediumSeaGreen")
            .attr("stroke-width", 1.5)
            .attr("d", yAccelerationPath(data));

        const pathAccZ = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "SteelBlue")
            .attr("stroke-width", 1.5)
            .attr("d", zAccelerationPath(data));

        // invisible layer for the interactive tip
        const dot = svg.append("g")
            .attr("display", "none");
        dot.append("circle")
            .attr("r", 2.5);
        dot.append("text")
            .attr("id", "text_l1")
            .attr("text-anchor", "left")
            .attr("y", -24);
        dot.append("text")
            .attr("id", "text_l2")
            .attr("text-anchor", "left")
            .attr("y", -16);
        dot.append("text")
            .attr("id", "text_l3")
            .attr("text-anchor", "left")
            .attr("y", -8);

        const pointerentered = () => {
            pathAccX.style("mix-blend-mode", null).style("stroke", "#ddd");
            pathAccY.style("mix-blend-mode", null).style("stroke", "#ddd");
            pathAccZ.style("mix-blend-mode", null).style("stroke", "#ddd");
            dot.attr("display", null);
        }

        const pointerleft = () => {
            pathAccX.style("mix-blend-mode", "multiply").style("stroke", null);
            pathAccY.style("mix-blend-mode", "multiply").style("stroke", null);
            pathAccZ.style("mix-blend-mode", "multiply").style("stroke", null);
            dot.attr("display", "none");
            svg.node().value = null;
            svg.dispatch("input", {bubbles: true});
        }

        const points = data.map((d) => [xScale(d.timestamp_ms), yScale(d.x), "x"])
            .concat(data.map((d) => [xScale(d.timestamp_ms), yScale(d.y), "y"]))
            .concat(data.map((d) => [xScale(d.timestamp_ms), yScale(d.z), "z"]));

        const pointermoved = (event) => {
            const [xm, ym] = d3.pointer(event);
            const i = d3.leastIndex(points, ([x, y]) => Math.hypot(x - xm, y - ym));
            const [x, y, axis] = points[i];

            pathAccX.style("stroke", "x" === axis ? null : "#ddd");
            pathAccY.style("stroke", "y" === axis ? null : "#ddd");
            pathAccZ.style("stroke", "z" === axis ? null : "#ddd");

            dot.attr("transform", `translate(${x},${y})`);
            dot.select("#text_l1").text("axis: " + axis.toUpperCase());
            dot.select("#text_l2").text("time: " + Math.round(xScale.invert(x)) + "ms");
            dot.select("#text_l3").text("acc: " + Math.round(yScale.invert(y)) + "mg");
            svg.property("value", points[i]).dispatch("input", {bubbles: true});
        }

        svg
            .on("pointerenter", pointerentered)
            .on("pointerleave", pointerleft)
            .on("pointermove", pointermoved);

        return svg.node();
    }

    async plot(fileName) {
        const data = await this.fetchData(FILE_DOWNLOAD_URL + "/" + fileName);
        const chart = await this.computeChart(data);
        document.querySelector("#" + DIV_ID_ACCELERATION_VIS).replaceChildren(chart);
    }
}
