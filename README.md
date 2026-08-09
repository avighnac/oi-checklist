# oi-checklist

A modern, full-featured web app for tracking progress across major Olympiads in Informatics: from IOI and USACO to APIO and EGOI.

Try it live: [https://checklist.spoi.org.in](https://checklist.spoi.org.in) or explore the interface using a demo account: [https://checklist.spoi.org.in/demo](https://checklist.spoi.org.in/demo).

## Features

- Mark problems as solved, partially solved, or assign exact scores out of 100.
- The checklist currently contains ~2,900 problems from 26 different sources.
- Start official past contests with a live timer and full performance tracking.
- For contests on [oj.uz](https://oj.uz) and [qoj.ac](https://qoj.ac), submissions are auto-synced and scored per subtask.
- Post-contest screens show rank, percentile, medal, and more. Based on actual historical results.
- oj.uz, qoj.ac, and codechef.com sync: Automatically update your checklist progress using your past submissions from three platforms.
- Arrange olympiads in any order you like, and hide those you don't want cluttering your view.
- Attach personal notes to problems for strategy, hints, or reminders, enhanced with a rudimentary markdown editor.

## Screenshots

### Landing Page and Dashboard

<p align="center">
  <img src="./src/static/images/landing-dark.png" alt="Landing page (dark mode)" width="80%">
</p>
<p align="center"><i>Dark mode landing page</i></p>

<p align="center">
  <img src="./src/static/images/dashboard-dark.png" alt="Dashboard view (logged in, dark mode)" width="80%">
</p>
<p align="center"><i>Dashboard after logging in</i></p>

### Virtual Contests

<p align="center">
  <img src="./src/static/images/virtual-contest-ongoing.png" alt="Ongoing virtual contest screen" width="80%">
</p>
<p align="center"><i>Ongoing virtual contest: live timer, progress, and end controls</i></p>

<p align="center">
  <img src="./src/static/images/virtual-history.png" alt="Virtual contest history" width="80%">
</p>
<p align="center"><i>View history of all past virtual contests</i></p>

<p align="center">
  <img src="./src/static/images/virtual-details.png" alt="Virtual contest post-analysis" width="80%">
</p>
<p align="center"><i>Detailed breakdown of performance: rank, medal, percentile, and more</i></p>

<p align="center">
  <img src="./src/static/images/virtual-graphs.jpg" alt="Virtual contest graphs" width="80%">
</p>
<p align="center"><i>Graphs that show detailed submission data and an overall contest timeline</i></p>

<p align="center"><i><small>Note: The scores shown in these screenshots have been arbitrarily chosen and may not reflect a score that's actually achievable under real contest scoring rules.</small></i></p>

## Supported Olympiads

The checklist contains a wide range of Olympiads in Informatics:

### Core Olympiads

* Singapore National Olympiad in Informatics (NOI)
* Asia-Pacific Informatics Olympiad (APIO)
* Central European Olympiad in Informatics (CEOI)
* International Olympiad in Informatics (IOI)
* Indian National Olympiad in Informatics (INOI)
* Indian Zonal Computing Olympiad (ZCO)
* USA Computing Olympiad (USACO):

  * Bronze
  * Silver
  * Gold
  * Platinum
* Croatian Olympiad in Informatics (COI)
* Indian IOI Training Camp (IOITC) _(problems are private and accessible only to IOITC participants)_
* Japanese Olympiad in Informatics:

  * Spring Camp
  * Final Round
  * Open Contest
* European Girls' Olympiad in Informatics (EGOI)
* European Junior Olympiad in Informatics (EJOI)
* International Zhautykov Olympiad (IZHO)
* Russian Olympiad in Informatics (ROI)
* Polish Olympiad in Informatics (POI)
* Baltic Olympiad in Informatics (BOI)
* Balkan Olympiad in Informatics (BKOI)
* Romanian Master of Informatics (RMI)

### Miscellaneous

* Google Kick Start

## Local Development Instructions

> Requires Python 3 and node.js installed locally

### Clone the repository

Ensure you have `git` installed.

In any appropriate directory, run:

```bash
git clone https://github.com/avighnac/oi-checklist
cd oi-checklist
```

### Ensure `python3` and python dependencies are installed

Install `python3` and `pip` from [python.org](https://www.python.org/). Then run `pip install bs4 requests cloudscraper`. You will need these packages for scraping (oj.uz, qoj.ac, codechef.com sync).

### Install `npm` and node dependencies

Install [node.js](https://nodejs.org/en) from here.

Run `npm install`.

### Create a `.env` file

Create a `.env` file with the following values:

| Variable | Description |
| - | - |
| `DATABASE_PATH` | The exact path to a `.db` file that we'll make in the next step. You can set this to any path you want; for example; I use `file:/Users/avighna/Desktop/oi-checklist/database.db` |
| `ROOT_URL` | Set this to `http://localhost:5501` |
| `GITHUB_CLIENT_ID` | Your GitHub client ID |
| `GITHUB_CLIENT_SECRET` | Your GitHub client secret |
| `DISCORD_CLIENT_ID` | Your Discord client ID |
| `DISCORD_CLIENT_SECRET` | Your Discord client secret |
| `GOOGLE_CLIENT_ID` | Your Google client ID |
| `GOOGLE_CLIENT_SECRET` | Your Google client secret |
| `QOJ_USERS` | Username(s) for the qoj.ac account(s) used for scraping |
| `QOJ_PASSES` | Password(s) for the same qoj.ac account(s) |
| `GMAIL_USER` | Email address for a Google account that will be used to send automated emails |
| `GMAIL_PASS` | App password for that Google account, can be generated after enabling two-factor authentication |

Note that every variable other than the first two isn't strictly required for the app to work. The client IDs and secrets are only needed for OAuth (which you may not need if you're running this locally). The qoj.ac username and password variables are needed for qoj.ac virtual contest scraping (which, again, you may or may not need).

However, they still need to be present in the `.env` file. If you’re not using those features locally, you can just fill them with placeholder values.

### Initialise the database

To initialse the database, run `npx prisma migrate deploy && npx prisma generate`. This will create a `.db` file at the path we specified earlier.

### Populate problems and contests

To populate problem and contest data into the database, run the following two commands sequentially:

```bash
npm run syncProblems
npm run syncContests
```

### And finally, run the server

`npm run dev` starts the server: OI Checklist will be available at [localhost:5501](http://localhost:5501).

## Contributing

Bug reports, feature requests, and PRs are welcome. Feel free to file an issue or submit a fix.

### Adding problems and contests

The `data` folder contains all problem and contest data. Feel free to add problems and/or contests here. For the exact format, please refer to existing problems/contests.

### Internal API Overview

Below is a brief overview of the key endpoints exposed by the backend.

#### prefix: `/auth`
- `/register`
- `/login`
- `/logout`
- `/check`
- `/github`
- `/discord`
- `/google`
- `/mail`
- `/forgot`

#### prefix: `/data`
- `/problems`
- `/virtual`
  - `/detail`
  - `/history`
  - `/scores`
  - `/stats`
  - `/summary`

#### prefix: `/user`
- `/problems`
- `/settings`
- `/link`
  - `/ojuz`
  - `/qoj`
- `/virtual`
  - `/confirm`
  - `/context`
  - `/end`
  - `/start`
  - `/submit`

For full details, check the `src/backend/routes/` directory, each route is self-contained and sufficiently commented.

## Development Notes

ChatGPT was used for structural suggestions, and Claude Sonnet 4 assisted with implementing some pages based on my designs and existing theme.

## License

This project is released under the MIT License.
