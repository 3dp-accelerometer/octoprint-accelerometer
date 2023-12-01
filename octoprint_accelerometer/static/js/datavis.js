"use strict";

class OctoAxxelDataVis {

    /**
     * @param {str} fileUrl - URL of tabular separated file, i.e. "plugin/octoprint_accelerometer/download/axxel-30f9c95c-20231127-235625233-s000-ax-f010-z015.tsv"
     * @param {char} separator - tabular separator (single character)
     * @return {[{seq: float, sample: float, x: float, y: float, z: float}]}
     */
    async fetchAccelerationData(fileUrl, separator = " ") {
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
    async computeAccelerationChart(data) {
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

        return self.svg = svg.node();
    }

    async plot(fileUrl, divNodeId) {
        const data = await this.fetchAccelerationData(fileUrl);
        const chart = await this.computeAccelerationChart(data);
        document.querySelector(divNodeId).append(chart);
    }
}
