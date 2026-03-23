# World News Map

## 1. Mission

We propose building a web application that ingests global event from the GDELT Project, applies intelligent filtering and spatial aggregation, and displays the events on an interactive map in (near) real-time. Taking inspiration from existing projects such as [worldmonitor](https://github.com/koala73/worldmonitor), [Live UA Map](https://liveuamap.com), [Monitor the Situation](https://monitor-the-situation.com), [Situation Monitor](https://hipcityreg-situation-monitor.vercel.app), [GLOBENEWS](https://globenews.fr), , the goal is to complement news articles from various sources with a spatial dimension and make global news more accessible to a wide audience, ranging from educational purposes to intelligence operations. The application should allow users to filter global events by location, date, topics, source, etc., and gain spatial and temporal insight into global events. 

## 2. Scope

### In Scope

- Deliver an interactive web application for exploration of world news events
- Integrate map control UI elements for user navigation, including event popups with summary information and links to source articles
- Incorporate a timeslider to explore the temporal dimension of events
- Implement filtering by topic, date range, source, and geographic bounding box
- Build a Python backend that queries, processes, and aggregates GDELT event data
- Provide near real-time updates through periodic backend data refreshes

### Out of Scope

- Using an LLM to translate natural-language user queries (e.g. "War in the Middle East") into structured filtering parameters and summaries
- Integration of additional data sources beyond GDELT (satellite imagery, weather data, etc.)
- User authentication, persistent user accounts, or personalized dashboards
- A newsletter feature that keeps users up to date with selected topics or regions

## 3. Objectives

### Scientific Validity Objectives

- Correct retrieval and parsing of GDELT event records with accurate geolocation, timestamps, and topic classifications
- Proper handling of known data quality issues such as low-precision geocoding (country-centroid coordinates) and duplicate events
- Faithful representation of the underlying data — filters and aggregations should not distort or misrepresent event distributions
- Verification against manual spot-checks (e.g. selecting a known major event and confirming it appears correctly on the map)

### Operational Performance Objectives

- Backend query and aggregation in (near) real-time
- Smooth, responsive UI where filter changes, timeslider adjustments, and map navigation update the visualization immediately
- Readable map at varying zoom levels — from global heatmap overview down to individual event clusters
- Intuitive interface usable by non-technical users without instruction

## 4. Inputs / Outputs

### Inputs

- GDELT event records
- User interactions: filter selections, timeslider position, and clicks on event clusters or individual markers

### Outputs

- An interactive web map displaying filtered global events as clustered markers and/or a heatmap layer
- Event popups showing summary information (headline, date, source, topic) with links to original news articles
- Dynamic visual updates reflecting the current state of all active filters and the selected time window


## 5. Constraints

- GDELT geocoding is automated and variable in precision - some events are geolocated only to country or city centroids, which limits spatial accuracy and may create misleading clusters
- GDELT has a strong English-language media bias, meaning event coverage is unevenly distributed across regions and languages
- GDELT API query rates and response sizes may limit how much data can be fetched in real time, requiring careful backend design
- Server infrastructure is limited to free-tier cloud services or locally hosted servers unless ETH provides dedicated resources


## 6. Educational Value

This project spans the full stack of a modern data-driven web application, giving the team hands-on experience across multiple disciplines. On the data engineering side, the team is required to deal with large, messy, real-world data. On the backend, the team gains experience with API design and spatial data processing. On the frontend, building an interactive map with dynamic filters develops skills in UI/UX design, geospatial visualization, and web development. The AI-assisted coding dimension is present throughout the project the project - using AI tools for development, debugging issues, and documentation. The collaborative aspect is natural since the backend and frontend are clearly separable workstreams that must integrate seamlessly, requiring the team to practice coordination, version control, and interface design between components. 
