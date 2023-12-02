"use strict";

class OctoAxxelDataSetVis {

    /**
     * @param {str} dataSetUrl - URL for GET request, i.e. "plugin/octoprint_accelerometer/get_data_listing"
     * @return {object}
     */
    async fetchData(dataSetUrl) {
        const response = await fetch(dataSetUrl);
        const rawData = await response.json();
        const rootNode = rawData["data_sets"]

        // flatten data from structured to hierarchy: https://d3js.org/d3-hierarchy/hierarchy#hierarchy
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
                        const fileName = streamNode["fft"][fftsId]["filename_no_ext"];
                        ffts.push({name: fileName});
                    }
                    streams.push({name: streamId, children: ffts});
                }
                sequences.push({name: sequenceId, children: streams});

            }
            runs.push({name: runId, children: sequences});


        }
        const data = {name: "/", children: runs}
        return data;
    }

    async computeChart(data) {
        const format = d3.format(",");
        const nodeSize = 17;
        const root = d3.hierarchy(data).eachBefore((i => d => d.index = i++)(0));
        const nodes = root.descendants();
        const width = 928;
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
                x: 400
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
            .text(d => d.data.name);

        node.append("title")
            .text(d => d.ancestors().reverse().map(d => d.data.name).join("/"));

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
            .data(root.copy().sum(value).descendants())
                .text(d => format(d.value, d));
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

    async plot(dataSetUrl, divNodeId) {
        const data = await this.fetchData(dataSetUrl);
        const chart = await this.computeChart(data);
        document.querySelector(divNodeId).append(chart);
    }
}

class OctoAxxelAccelerationVis {

    /**
     * @param {str} fileUrl - URL of tabular separated file, i.e. "plugin/octoprint_accelerometer/download/axxel-30f9c95c-20231127-235625233-s000-ax-f010-z015.tsv"
     * @param {char} separator - tabular separator (single character)
     * @return {[{seq: float, sample: float, x: float, y: float, z: float}]}
     */
    async fetchData(fileUrl, separator = " ") {
        return d3.dsv(separator, fileUrl, (line) => {
                return {
                    seq:    parseFloat(line.seq),
                    sample: parseFloat(line.sample),
                    x:      parseFloat(line.x),
                    y:      parseFloat(line.y),
                    z:      parseFloat(line.z),
                }
            }
        );
    }

    /**
     * @param {[{seq: float, sample: float, x: float, y: float, z: float}]}: data - chart data to plot
     */
    async computeChart(data) {
        // declare the chart dimensions and margins
        const width = 640;
        const height = 400;
        const marginTop = 20;
        const marginRight = 20;
        const marginBottom = 30;
        const marginLeft = 40;

        // declare the x (horizontal position) scale
        const x = d3.scaleLinear()
            .domain([0, 5000])
            .range([marginLeft, width - marginRight]);

        // declare the y (vertical position) scale
        const y = d3.scaleLinear()
            .domain([-10000, 10000])
            .range([height - marginBottom, marginTop]);

        // create the SVG container
        const svg = d3.create("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [0, 0, width, height])
            .attr("style", "max-width: 100%; height: auto; overflow: visible; font: 10px sans-serif;");

        // add the horizontal axis
        svg.append("g")
            .attr("transform", `translate(0,${height - marginBottom})`)
            .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0))
            .call(g => g.append("text")
                .attr("x", height - marginBottom)
                .attr("y", width - 10)
                .attr("fill", "currentColor")
                .attr("text-anchor", "start")
                .text("time [s]"));

        // add the vertical axis
        svg.append("g")
            .attr("transform", `translate(${marginLeft},0)`)
            .call(d3.axisLeft(y).ticks(height / 40))
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


        // data.forEach((d) => console.log(d));

        // draw the lines
        const line = d3.line()
            .x(d => x(d.sample))
            .y(d => y(d.z));

        svg.append("path")
            .attr("fill", "none")
            .attr("stroke", "steelblue")
            .attr("stroke-width", 1.5)
            .attr("d", line(data));

        return svg.node();
    }

    async plot(fileUrl, divNodeId) {
        const data = await this.fetchData(fileUrl);
        const chart = await this.computeChart(data);
        document.querySelector(divNodeId).append(chart);
    }
}
