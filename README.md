# Visual Running Biography: An Interactive Exploration of Personal Training History

## Project Information

- **Course:** CS 889 – Information Visualization  
- **Institution:** University of Waterloo  
- **Author:** Sofiia Tkach  

This project is an interactive visualization of personal running and training history. It explores how training volume, intensity, and other contextual factors evolve over time using visual analytics techniques.

## How to run

1. Install Python dependencies (once):

```bash
pip install -r requirements.txt
```

2. Run the app from the project root with your Strava API credentials (you need a Strava developer application to obtain these values):

```bash
cd /Users/sofiiatkach/Desktop/uni/infVizProject
STRAVA_CLIENT_ID="<your_client_id>" \
STRAVA_CLIENT_SECRET="<your_client_secret>" \
STRAVA_REFRESH_TOKEN="<your_refresh_token>" \
python3 -m backend.app
```

After the server starts, open the printed URL in your browser to use the visualization.

## Project demo

https://youtu.be/l5WsTX0QSkE?si=gec4WAtoum5FGE_t

## WebApp Screenshots

Overview of weekly training load:

![Weekly overview](<screenshots/Screenshot 2026-04-01 at 4.27.40 PM.png>)

Zoomed-in view of specific weeks and runs (distance):

![Zoomed weeks](<screenshots/Screenshot 2026-04-01 at 4.29.22 PM.png>)

Zoomed-in view of specific weeks and runs (pace):

![Intensity heatmap](<screenshots/Screenshot 2026-04-01 at 4.42.09 PM.png>)

View of a single week:

![Week detail](<screenshots/Screenshot 2026-04-01 at 4.43.03 PM.png>)

Detailed information about run - pace per km:

![Workout breakdown](<screenshots/Screenshot 2026-04-01 at 4.45.05 PM.png>)

Detailed information about run - training zones:

![Context filters](<screenshots/Screenshot 2026-04-01 at 4.45.22 PM.png>)

Detailed information about run - heart rate per km:

![Timeline controls](<screenshots/Screenshot 2026-04-01 at 4.45.31 PM.png>)

Detailed information about run - efficiency per km:

![Additional overview](<screenshots/Screenshot 2026-04-01 at 4.45.42 PM.png>)