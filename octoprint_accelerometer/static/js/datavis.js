"use strict";

// @see: https://observablehq.com/@d3/gallery?utm_source=d3js-org&utm_medium=hero&utm_campaign=try-observable

const FILE_DOWNLOAD_URL = "plugin/octoprint_accelerometer/download";
const DATA_SET_URL = "plugin/octoprint_accelerometer/get_data_listing";
const DIV_ID_DATA_SET_VIS = "tab_plugin_octoprint_data_set_vis";
const DIV_ID_DATA_SET_VIS_HEADER = "tab_plugin_octoprint_data_set_vis_header";
const DIV_ID_ACCELERATION_VIS = "tab_plugin_octoprint_acceleration_vis";
const DIV_ID_FFT_VIS = "tab_plugin_octoprint_fft_vis";

/**
 * blueprint: https://observablehq.com/@d3/indented-tree?intent=fork
 */
class OctoAxxelDataSetVis {

    /**
     * @param {str} dataSetUrl - URL for GET request, i.e. "plugin/octoprint_accelerometer/get_data_listing"
     * @return {{ name: str, children: [...], data: {...} }}
     */
    async fetchData(dataSetUrl) {
        const response = await fetch(dataSetUrl);
        const rawData = await response.json();
        const rootNode = rawData["data_sets"]["runs"]

        // flatten data from structured to hierarchy (dict of "name", "children"): https://d3js.org/d3-hierarchy/hierarchy#hierarchy
        // also append node attributes to "data" of each hierarchy node
        const runs = [];
        for (const runHash in rootNode) {
            const runNode = rootNode[runHash];
            const sequencesNode = runNode["sequences"];

            const sequences = [];
            for (const sequenceId in sequencesNode) {
                const streamsNode = sequencesNode[sequenceId]["streams"];

                const streams = [];
                for (const streamHash in streamsNode) {
                    const streamNode = streamsNode[streamHash];

                    const ffts = [];
                    for (const fftId in streamNode["fft"]) {
                        const fftNode = streamNode["fft"][fftId];
                        const fftNodeText = fftNode["fft_axis"].toUpperCase() + " f=" + fftNode["sequence_frequency_hz"] + "Hz zeta=" + fftNode["sequence_zeta_em2"] * 0.01;
                        ffts.push({name: fftNodeText, data: {"fft": fftNode}});
                    }
                    const streamNodeMeta = streamNode["meta"];
                    const streamNodeText = streamNodeMeta["sequence_axis"].toUpperCase() + "-Axis 𝑓=" + streamNodeMeta["sequence_frequency_hz"] + "Hz ζ=" + streamNodeMeta["sequence_zeta_em2"] * 0.01;
                    // Note: FFT children are not going to be plotted in the tree, so this those go to "data.children" rather than "children".
                    streams.push({name: streamNodeText, children: [], data: {"stream": streamNode, "children": ffts}});
                }
                sequences.push({name: "seq=" + sequenceId, children: streams, data: {"series": "-"}});
            }
            const ts = "" + runNode.started.year +
                "." + runNode.started.month.toString().padStart(2,"0") +
                "." + runNode.started.day.toString().padStart(2,"0") +
                " " + runNode.started.hour.toString().padStart(2,"0") +
                ":" + runNode.started.minute.toString().padStart(2,"0") +
                ":" + runNode.started.second.toString().padStart(2,"0") +
                "." + runNode.started.milli_second.toString().padStart(3,"0");
            runs.push({name: ts, children: sequences, data: {"run": "-"}});
        }
        const data = {name: "/", children: runs, data: {"root": "-"}};
        return data;
    }

    /**
     * @param {{ name: str, children: [...], data: {...} }}: data - chart data to plot
     */
    async computeChart(data) {
        const format = d3.format("");
        const nodeSize = 17;
        const root = d3.hierarchy(data).eachBefore((i => d => d.index = i++)(0));
        const nodes = root.descendants();
        const width = 220;
        const headerHeight = "0em";
        const height = (nodes.length + 1) * nodeSize;

        const constColumns = [
            { label: "/", x: "1em" },
            { label: "Run", x: "4em" },
            { label: "Seq.", x: "6.5em" },
            { label: "Stream", x: "10.5em" },
            { label: "FFT", x: "13em" },
            { label: "Count", x: "21em" },
        ];

        const computedColumns = [
            {
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

        const headerSvg = d3.create("svg")
            .attr("width", width)
            .attr("height", headerHeight)
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
            .attr("fill", d => d.children ? "#999" : null);

        node.append("text")
            .attr("dy", "0.32em")
            .attr("x", d => d.depth * nodeSize + 6)
            .attr("filename", d => {
                if ("stream" in d.data.data)
                return d.data.data.stream.file.filename_ext;
                return undefined;})
            .attr("fft_files", d => {
                if ("stream" in d.data.data)
                    return JSON.stringify({
                        "x": d.data.data.stream.ffts.x.file.filename_ext,
                        "y": d.data.data.stream.ffts.y.file.filename_ext,
                        "z": d.data.data.stream.ffts.z.file.filename_ext});
                return undefined;
            })
            .attr("nodeType", d => {
                if ("root" in d.data.data) return "root";
                if ("run" in d.data.data) return "run";
                if ("series" in d.data.data) return "series";
                if ("stream" in d.data.data) return "stream";
                return undefined;})
            .text(d => d.data.name)
            .on("pointerenter", event => {
                if (event.target.getAttribute("nodeType") === "stream")
                    event.target.setAttribute("style", "font-weight:bold;cursor: pointer;");})
            .on("pointerleave", event => {
                if (event.target.getAttribute("nodeType") === "stream")
                    event.target.setAttribute("style", "font-weight:normal;cursor: default;");})
            .on("click", event => {
                const nodeType = event.target.getAttribute("nodeType");
                if (nodeType === "stream") {
                    const fileName = event.target.getAttribute("filename");
                    const fftFiles = JSON.parse(event.target.getAttribute("fft_files"));
                    (async () => new OctoAxxelAccelerationVis().plot(fileName))();
                    (async () => new OctoAxxelFftVis().plot(fftFiles))();
                }
            });

        node.append("title")
            .text(d => {
                const path = d.ancestors().reverse().map(d => d.data.name);
                let text = (path.length >= 2) ? "run: " + path[1] : "";
                text += (path.length >= 3) ? " | " + path[2] : "";
                text += (path.length >= 4) ? " | " + path[3] : "";
                return text;
                });

        for (const {value, format, x} of computedColumns) {
            /*svg.append("text")
                .attr("dy", "0.32em")
                .attr("y", -nodeSize)
                .attr("x", x)
                .attr("text-anchor", "end")
                .attr("font-weight", "bold")
                .text(label);*/

            node.append("text")
                .attr("dy", "0.32em")
                .attr("x", x)
                .attr("text-anchor", "end")
                .attr("fill", d => d.children ? null : "#555")
                .text(d => d.children ? d.children.length : "-");
        }

        for (const {label, x} of constColumns) {
            headerSvg.append("text")
                .attr("dy", "0.32em")
                .attr("y", -nodeSize)
                .attr("x", x)
                .attr("text-anchor", "end")
                .attr("font-weight", "bold")
                .text(label);
        }

        return [headerSvg.node(), svg.node()]
    }

    async plot() {
        const data = await this.fetchData(DATA_SET_URL);
        const [header, chart] = await this.computeChart(data);
        document.querySelector("#" + DIV_ID_DATA_SET_VIS_HEADER).replaceChildren(header);
        document.querySelector("#" + DIV_ID_DATA_SET_VIS).replaceChildren(chart);
    }
}

/**
 * blueprints:
 * - mouse events - https://observablehq.com/@d3/multi-line-chart/2?intent=fork
 * - simple line chart - https://observablehq.com/@d3/line-chart/2?intent=fork
 * - zoom - https://observablehq.com/@d3/zoomable-bar-chart?intent=fork
 * - another zoom example: https://codepen.io/jjjj60110/pen/RMLBpG
 */
class OctoAxxelAccelerationVis {


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
        const yAxis = d3.axisLeft(yScale).ticks(height / 40, format).tickSizeOuter(0);

        // create the SVG container
        const svg = d3.create("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height])
            .attr("style", "max-width: 100%; height: auto; overflow: visible; font: 10px sans-serif;");

        // clip path to stop lines and x-axis spilling over
        svg.append("defs").append("clipPath")
          .attr("id", "clip0815")
          .append("rect")
          .attr("x", marginLeft - 15)
          .attr("width", width - marginLeft - marginRight + 30)
          .attr("height", height);

        // time axis
        svg.append("g")
            .attr("class", "x-axis")
            .attr("clip-path", "url(#clip0815)")
            .attr("transform", `translate(0,${height - marginBottom})`)
            .call(xAxis)
            .call(g => g.select(".domain").remove())
            .call(g => g.append("text")
                .attr("x", width / 2)
                .attr("y", marginBottom )
                .attr("fill", "currentColor")
                .attr("text-anchor", "start")
                .text("Time [ms] →"));

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
                .text("↑ Acceleration [mg]"));

        // draw the lines
        const xLine = d3.line(d => xScale(d.timestamp_ms), d => yScale(d.x));
        const yLine = d3.line(d => xScale(d.timestamp_ms), d => yScale(d.y));
        const zLine = d3.line(d => xScale(d.timestamp_ms), d => yScale(d.z));

        const pathX = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "Tomato")
            .attr("stroke-width", 0.75)
            .attr("clip-path", "url(#clip0815)")
            .attr("d", xLine(data));

        const pathY = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "MediumSeaGreen")
            .attr("stroke-width", 0.75)
            .attr("clip-path", "url(#clip0815)")
            .attr("d", yLine(data));

        const pathZ = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "SteelBlue")
            .attr("stroke-width", 0.75)
            .attr("clip-path", "url(#clip0815)")
            .attr("d", zLine(data));

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
            pathX.style("mix-blend-mode", null).style("stroke", "#ddd");
            pathY.style("mix-blend-mode", null).style("stroke", "#ddd");
            pathZ.style("mix-blend-mode", null).style("stroke", "#ddd");
            dot.attr("display", null);
        }

        const pointerleft = () => {
            pathX.style("mix-blend-mode", "multiply").style("stroke", null);
            pathY.style("mix-blend-mode", "multiply").style("stroke", null);
            pathZ.style("mix-blend-mode", "multiply").style("stroke", null);
            dot.attr("display", "none");
            svg.node().value = null;
            svg.dispatch("input", {bubbles: true});
        }

        const pointermoved = (event) => {
            const points = data.map(d => [xScale(d.timestamp_ms), yScale(d.x), "x"])
                .concat(data.map(d => [xScale(d.timestamp_ms), yScale(d.y), "y"]))
                .concat(data.map(d => [xScale(d.timestamp_ms), yScale(d.z), "z"]));

            const [xm, ym] = d3.pointer(event);
            const i = d3.leastIndex(points, ([x, y]) => Math.hypot(x - xm, y - ym));
            const [x, y, axis] = points[i];

            pathX.style("stroke", "x" === axis ? null : "#ddd");
            pathY.style("stroke", "y" === axis ? null : "#ddd");
            pathZ.style("stroke", "z" === axis ? null : "#ddd");

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

        const zoom = (svg) => {
            const extent = [[marginLeft, marginTop], [width - marginRight, height - marginTop]];
            const zoomed = (event) => {
                // update scale
                xScale.range([marginLeft, width - marginRight].map(d => event.transform.applyX(d)));

                // zooms x-axis
                svg.selectAll(".x-axis").call(xAxis);

                // zooms lines
                pathX.attr("d", xLine(data));
                pathY.attr("d", yLine(data));
                pathZ.attr("d", zLine(data));

                // update pointer
                pointermoved(event);
            };

            // zoom behaviour
            svg.call(d3.zoom()
                .scaleExtent([1, 32])
                .translateExtent(extent)
                .extent(extent)
                .on("zoom", zoomed));
        };

        svg.call(zoom);

        return svg.node();
    }

    async plot(fileName) {
        const data = await this.fetchData(FILE_DOWNLOAD_URL + "/" + fileName);
        const chart = await this.computeChart(data);
        document.querySelector("#" + DIV_ID_ACCELERATION_VIS).replaceChildren(chart);
    }
}

class OctoAxxelFftVis {

    /**
     * @param {{"x": str, "y": str, "z": str]} fileUrls - URL of tabular separated file,
     * i.e. {"x": "plugin/octoprint_accelerometer/download/fft-30f9c95c-20231127-235625233-s000-ax-f010-z015-x.tsv",
     *       "y": "plugin/octoprint_accelerometer/download/fft-30f9c95c-20231127-235625233-s000-ax-f010-z015-y.tsv",
     *       "z": "plugin/octoprint_accelerometer/download/fft-30f9c95c-20231127-235625233-s000-ax-f010-z015-z.tsv"}
     * @param {char} separator - tabular separator (single character)
     * @return {[{frequency_hz: float, fft_x: float, fft_y: float, fft_z: float}]}
     */
    async fetchData(fileUrls, separator = " ") {
        const rawData = {};
        const data = []

        for (const fileUrlKey in fileUrls) {
            const fileUrl = fileUrls[fileUrlKey];
            const axisFft = await d3.dsv(separator, fileUrl, (line) => {
                return {
                        frequency_hz: parseFloat(line.freq_hz),
                        fft: parseFloat(line.fft),
                };
            });
            rawData[fileUrlKey] = axisFft;
        }

        // assume each axis/file has the same frequency domain (same length and same frequencies)
        if (Object.keys(rawData.x).length == Object.keys(rawData.y).length &&
            Object.keys(rawData.x).length == Object.keys(rawData.z).length) {
            for (let idx = 0; idx < rawData.x.length; idx++) {
                const x = rawData.x[idx];
                const y = rawData.y[idx];
                const z = rawData.z[idx];
                if (x.frequency_hz !== y.frequency_hz || y.frequency_hz !== z.frequency_hz) {
                    console.warn("fft mismatch: x.frequency_hz: " + x.fft + " y.frequency_hz: " + y.fft + " z.frequency_hz: " + z.fft);
                    break;
                }
                data.push({"frequency_hz": x.frequency_hz, "fft_x": x.fft, "fft_y": y.fft, "fft_z": z.fft});
            }
        }

        return data;
    }

    /**
     * @param {[{frequency_hz: float, fft_x: float, fft_y: float, fft_z: float}]}: data - chart data to plot
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
            .domain(d3.extent(data, d => d.frequency_hz)).nice()
            .range([marginLeft, width - marginRight]);
        const xAxis = d3.axisBottom(xScale).ticks(width / 80, format).tickSizeOuter(0);

        // declare the y scale (acceleration domain)
        const yScale = d3.scaleLinear()
            .domain([d3.min(data, d => Math.min(d.fft_x, d.fft_y, d.fft_z)), d3.max(data, d => Math.max(d.fft_x, d.fft_y, d.fft_z))]).nice()
            .range([height - marginBottom, marginTop]);
        const yAxis = d3.axisLeft(yScale).ticks(height / 40, format)

        // create the SVG container
        const svg = d3.create("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height])
            .attr("style", "max-width: 100%; height: auto; overflow: visible; font: 10px sans-serif;");

        // clip path to stop lines and x-axis spilling over
        svg.append("defs").append("clipPath")
            .attr("id", "clip1317")
            .append("rect")
            .attr("x", marginLeft - 15)
            .attr("width", width - marginLeft - marginRight + 30)
            .attr("height", height);

        // frequency axis
        svg.append("g")
            .attr("class", "x-axis")
            .attr("clip-path", "url(#clip1317)")
            .attr("transform", `translate(0,${height - marginBottom})`)
            .call(xAxis)
            .call(g => g.select(".domain").remove())
            .call(g => g.append("text")
                .attr("x", width / 2)
                .attr("y", marginBottom )
                .attr("fill", "currentColor")
                .attr("text-anchor", "start")
                .text("Frequency [Hz] →"));

        // FFT coefficient/amplitude axis
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
                .text("↑ FFT"));

        // draw the lines
        const xLine = d3.line(d => xScale(d.frequency_hz), d => yScale(d.fft_x));
        const yLine = d3.line(d => xScale(d.frequency_hz), d => yScale(d.fft_y));
        const zLine = d3.line(d => xScale(d.frequency_hz), d => yScale(d.fft_z));

        const pathX = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "Tomato")
            .attr("stroke-width", 0.75)
            .attr("clip-path", "url(#clip1317)")
            .attr("d", xLine(data));

        const pathY = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "MediumSeaGreen")
            .attr("stroke-width", 0.75)
            .attr("clip-path", "url(#clip1317)")
            .attr("d", yLine(data));

        const pathZ = svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "SteelBlue")
            .attr("stroke-width", 0.75)
            .attr("clip-path", "url(#clip1317)")
            .attr("d", zLine(data));

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
            pathX.style("mix-blend-mode", null).style("stroke", "#ddd");
            pathY.style("mix-blend-mode", null).style("stroke", "#ddd");
            pathZ.style("mix-blend-mode", null).style("stroke", "#ddd");
            dot.attr("display", null);
        }

        const pointerleft = () => {
            pathX.style("mix-blend-mode", "multiply").style("stroke", null);
            pathY.style("mix-blend-mode", "multiply").style("stroke", null);
            pathZ.style("mix-blend-mode", "multiply").style("stroke", null);
            dot.attr("display", "none");
            svg.node().value = null;
            svg.dispatch("input", {bubbles: true});
        }

        const pointermoved = (event) => {
            const points = data.map(d => [xScale(d.frequency_hz), yScale(d.fft_x), "x"])
                .concat(data.map(d => [xScale(d.frequency_hz), yScale(d.fft_y), "y"]))
                .concat(data.map(d => [xScale(d.frequency_hz), yScale(d.fft_z), "z"]));
            const [xm, ym] = d3.pointer(event);
            const i = d3.leastIndex(points, ([x, y]) => Math.hypot(x - xm, y - ym));
            const [x, y, axis] = points[i];

            pathX.style("stroke", "x" === axis ? null : "#ddd");
            pathY.style("stroke", "y" === axis ? null : "#ddd");
            pathZ.style("stroke", "z" === axis ? null : "#ddd");

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

        const zoom = (svg) => {
            const extent = [[marginLeft, marginTop], [width - marginRight, height - marginTop]];
            const zoomed = (event) => {
                // update scale
                xScale.range([marginLeft, width - marginRight].map(d => event.transform.applyX(d)));

                // zooms x-axis
                svg.selectAll(".x-axis").call(xAxis);

                // zooms lines
                pathX.attr("d", xLine(data));
                pathY.attr("d", yLine(data));
                pathZ.attr("d", zLine(data));

                // update pointer
                pointermoved(event);
            };

            // zoom behaviour
            svg.call(d3.zoom()
                .scaleExtent([1, 32])
                .translateExtent(extent)
                .extent(extent)
                .on("zoom", zoomed));
        };

        svg.call(zoom);

        return svg.node();
    }

    async plot(fileNames) {
        const fileUrls = {};
        for (const axis in fileNames) { fileUrls[axis] = FILE_DOWNLOAD_URL + "/" + fileNames[axis]; }
        const data = await this.fetchData(fileUrls);
        const chart = await this.computeChart(data);
        document.querySelector("#" + DIV_ID_FFT_VIS).replaceChildren(chart);
    }
}

// render data-set tree on load
(async () => new OctoAxxelDataSetVis().plot())();
