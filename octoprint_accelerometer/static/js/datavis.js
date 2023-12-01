chart_data = async function() {
    return d3.dsv(" ",
           "plugin/octoprint_accelerometer/download/axxel-30f9c95c-20231127-235625233-s000-ax-f010-z015.tsv",
           (d) => {
               return {
                   seq:   parseFloat(d.seq),
                   sample: parseFloat(d.sample),
                   x:     parseFloat(d.x),
                   y:     parseFloat(d.y),
                   z:     parseFloat(d.z),
               };
           });
};

chart = async function(data) {
      // Declare the chart dimensions and margins.
  const width = 640;
  const height = 400;
  const marginTop = 20;
  const marginRight = 20;
  const marginBottom = 30;
  const marginLeft = 40;

  // Declare the x (horizontal position) scale.
  const x = d3.scaleLinear()
      .domain([0, 5000])
      .range([marginLeft, width - marginRight]);

  // Declare the y (vertical position) scale.
  const y = d3.scaleLinear()
      .domain([-10000, 10000])
      .range([height - marginBottom, marginTop]);

  // Create the SVG container.
  const svg = d3.create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto; overflow: visible; font: 10px sans-serif;");

  // Add the horizontal axis.
  svg.append("g")
      .attr("transform", `translate(0,${height - marginBottom})`)
      .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));

  // Add the vertical axis.
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
          .text("↑ Daily close ($)"));


    data.forEach(function(d) {
        console.log(d)
    });

     // Draw the lines.
  const line = d3.line()
        .x(d => x(d.sample))
        .y(d => y(d.z));

  svg.append("path")
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 1.5)
      .attr("d", line(data));

  return self.svg = svg.node();

};
