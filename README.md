# Football Intelligence Hub

Please continue building this app;I had to stop partway — the workspace ran out of credits mid-build. Here's where things stand.

Done so far

- The database is set up: competitions, teams, matches (real historical results), analysis snapshots, the prediction ledger, per-engine prediction records, and an import log.

- The full analytical core is written and requires zero paid keys:

  - Poisson, Dixon-Coles, negative binomial, home/away split, Bayesian shrunk strength, dynamic Elo, form/momentum, head-to-head, and a logistic-regression model that trains itself inside the app on stored results (trained chronologically so no future information leaks in).

  - A real Monte Carlo simulator (50,000 runs by default, minute-by-minute, producing scorelines, who-scores-first, comebacks and late winners).

  - Consensus, contradiction detection, stability testing under perturbed assumptions, data-quality scoring, outcome discovery across all markets, and the "no strong edge / insufficient intelligence / high model conflict / data quality too low" rules so it never forces a prediction.

  - An evidence layer, a provider registry where Sportmonks, API-Football, NewsAPI and odds sit dormant and clearly labelled rather than invented, and post-match settlement with Brier score and log loss.

- The server layer for importing free open football data (the openfootball dataset — real results, no key needed), searching matches by name, running the pipeline, batch analysis, the prediction ledger, settlement and model performance.

Not yet done

- The entire interface: home search, match intelligence workspace, batch lab, simulation lab, engine arena, evidence, predictions, model lab, post-match audit, system health, and the visual design.

- Importing the data and testing the pipeline end to end. Nothing has been run or verified yet, so the app is not usable in its current state.

Roughly the back half of the build remains. Continuing needs available credits — once they're topped up, say the word and I'll pick up from exactly here and finish the interface and testing.MASTER BUILD PROMPT — GLOBAL FOOTBALL INTELLIGENCE SYSTEM

You are building a production-grade Global Football Intelligence System from the attached ZIP.

The ZIP is the master source project. Do not treat it as a prototype, mockup, concept demo, or collection of disconnected examples.

The objective is to turn the supplied project into the complete, polished, deployable application described below.

1. CORE INSTRUCTION

Build the entire application as one coherent intelligence platform.

Do NOT:

reduce the system to a football tips website

replace the intelligence architecture with a simple LLM chatbot

remove the backend

replace real data architecture with hardcoded fake data

invent football statistics

invent bookmaker odds

invent injuries/news

create fake "AI analysis" cards that have no underlying engine

remove the simulation engine

remove batch analysis

remove the prediction ledger

remove calibration architecture

remove provider adapters

simplify the engine arena into one prediction formula

force a prediction when the evidence is insufficient

assume the bookmaker favourite automatically wins

create an old-fashioned 2010-era football website interface

The supplied architecture and MASTER_APP.md are the governing specification.

If something is incomplete, implement it properly rather than deleting it.

2. PRODUCT IDENTITY

The product is:

GLOBAL FOOTBALL INTELLIGENCE

It is an AI-assisted football intelligence and prediction platform designed to investigate football matches using:

structured football data

historical data

xG

team strength

player information

lineups

injuries

suspensions

tactical information

news

odds

odds movement

market information

statistical models

machine learning

Bayesian reasoning

simulations

model consensus

contradiction detection

calibration

historical model performance

AI reasoning

The system should answer:

"What is most likely to happen in this match, across all meaningful markets, based on the strongest available evidence?"

NOT:

"Who is the favourite?"

3. UI / DESIGN REQUIREMENTS

The interface must look like a modern 2026 AI/data intelligence platform.

Do NOT make it look like:

an old betting website

a football blog

a 2010 statistics website

a spreadsheet

a generic admin dashboard

a template with excessive cards

a basic chatbot

Use a sophisticated, premium, clean intelligence-terminal aesthetic.

The interface should be:

modern

fast

minimal

highly readable

responsive

intuitive

information-dense without being cluttered

visually hierarchical

desktop-first but excellent on tablet/mobile

suitable for serious analysis

Use modern typography, spacing, subtle borders, restrained visual effects and strong data visualization.

Avoid excessive gradients, excessive rounded cards, cartoon football imagery and unnecessary decoration.

4. HOME SCREEN

The primary interaction should be extremely simple.

At the center/top:

SEARCH ANY FOOTBALL MATCH

Example:

Lyon vs Monaco

The user should be able to type:

Lyon vs Monaco

Arsenal Manchester City

Real Madrid v Barcelona

Inter vs Juventus

The system should resolve the intended fixture automatically.

Search should support:

autocomplete

team-name aliases

competitions

dates

multiple possible fixtures

ambiguous team names

If several fixtures match, show a clean resolver:

Which match did you mean?

Then let the user select one.

5. MATCH INTELLIGENCE WORKSPACE

Once a match is selected, launch the intelligence pipeline.

Show an elegant live analysis status such as:

Resolving fixture

Gathering football data

Gathering news

Checking lineups/injuries

Gathering market information

Building features

Running statistical engines

Running ML engines

Running tactical analysis

Running simulation

Comparing engines

Checking contradictions

Calibrating probabilities

Discovering strongest outcomes

Generating intelligence report

Do not fake completion.

If a provider is unavailable, clearly show:

SOURCE UNAVAILABLE

and continue using available sources.

6. DATA ACQUISITION LAYER

Implement the architecture for multiple independent sources.

Primary football data providers should include the existing adapters in the ZIP.

Preserve:

Sportmonks adapter

API-Football adapter

NewsAPI adapter

Design the system so additional providers can be plugged in later.

The system should collect, where available:

Match

fixture

competition

date

kickoff

venue

referee

match status

Team

form

league position

home/away performance

goals

goals conceded

xG

xGA

shots

shots on target

possession

set pieces

defensive statistics

scoring patterns

conceding patterns

Players

injuries

suspensions

availability

expected lineup

confirmed lineup

player statistics

goals

assists

minutes

xG

xA

defensive contribution

goalkeeper information

Context

rest

fixture congestion

travel

competition importance

motivation indicators

manager changes

tactical changes

weather where available

Historical

previous meetings

recent form

opponent-adjusted form

historical goal distributions

home/away splits

Markets

bookmaker odds

opening odds

current odds

odds movement

market consensus

implied probability

News

Collect relevant information about:

teams

managers

players

injuries

lineup expectations

tactical changes

transfers

motivation

internal club events

press conferences

credible reports

Every piece of evidence should have:

source

timestamp

freshness

source reliability

category

confidence

original URL when available

7. EVIDENCE ENGINE

Do not blindly merge information.

Build an evidence layer.

Every important claim should conceptually have:

claim
source
timestamp
freshness
reliability
confidence
corroboration
conflict status


If two sources disagree, do NOT silently average them.

Show:

CONFLICTING INFORMATION

and allow the intelligence layer to reason about which source is more credible.

Official team information should generally carry greater authority for lineup/injury announcements than anonymous or low-quality sources.

8. ENGINE ARENA

The system must support multiple independent analytical engines.

At minimum preserve/create interfaces for:

Statistical

Poisson

Dixon-Coles

Skellam

Negative Binomial

Team strength

Elo

Dynamic Elo

player-adjusted strength

home advantage

xG

recent xG

xGA

opponent-adjusted xG

xG ensemble

Machine learning

Architecture for:

Logistic Regression

Random Forest

XGBoost

LightGBM

CatBoost

neural/temporal models where appropriate

Bayesian

Bayesian team strength

uncertainty distributions

posterior probabilities

Tactical

Analyze:

pressing

defensive block

possession

transition

width

set pieces

tactical mismatch

Player impact

Estimate the effect of:

missing players

returning players

key attackers

defenders

goalkeeper

lineup changes

Market intelligence

Use bookmaker information as ONE signal.

Never treat bookmaker probability as truth.

9. SIMULATION ENGINE

This is a major component.

Do not reduce simulation to a decorative number.

Build a real simulation layer capable of producing tens of thousands of match worlds.

Target architecture:

50,000+ simulations per match, configurable.

Simulations should generate:

final score

home goals

away goals

1X2

totals

BTTS

team totals

score distributions

scenario distributions

Where feasible, introduce match-state simulation:

home scores first

away scores first

high tempo

low tempo

early card

red-card scenario

key-player absence scenario

defensive scenario

late-game scenarios

The simulation output must feed the final probability surface.

10. OUTCOME DISCOVERY ENGINE

Do NOT begin with:

"Who wins?"

Instead analyze the entire outcome space.

At minimum evaluate:

Match result

Home

Draw

Away

Goals

Over 0.5

Over 1.5

Over 2.5

Over 3.5

Under equivalents

BTTS

Yes

No

Double chance

1X

X2

12

Team goals

Home over/under

Away over/under

Correct score

Rank likely scorelines.

Additional markets can be added when reliable data supports them.

11. PROBABILITY IS NOT CONFIDENCE

Keep these separate.

For every important outcome show:

Probability

What the model estimates.

Confidence

How much evidence supports the estimate.

Model consensus

How many independent engines agree.

Stability

How much the result changes when reasonable assumptions change.

Data quality

How complete and reliable the underlying information is.

Market divergence

Difference between internal probability and market-implied probability.

Risk

Known factors that could invalidate the prediction.

Do NOT use one giant "confidence score" to hide all of this.

12. CONTRADICTION ENGINE

If engines disagree significantly, identify it.

Example:

STATISTICAL       → Lyon
xG                → Lyon
SIMULATION        → Lyon
TACTICAL          → Monaco
PLAYER IMPACT     → Monaco
MARKET            → Lyon


The system should say:

INTELLIGENCE CONFLICT

Then investigate:

Why?

Which assumptions differ?

Which evidence is strongest?

Is the conflict caused by lineup uncertainty?

Is the market pricing something the models don't see?

Is the tactical model seeing a matchup advantage?

Do not simply average everything and hide the disagreement.

13. MARKET DIVERGENCE

Calculate:

internal probability
vs
market implied probability


Example:

Market: Lyon 68%
Internal model: Lyon 46%


This should trigger:

MAJOR MARKET–MODEL DIVERGENCE

It does NOT automatically mean Monaco is the bet.

The system must investigate the divergence.

14. AI REASONING ENGINE

The AI should receive structured intelligence, not raw uncontrolled web content.

The reasoning layer should answer:

What do we know?

What evidence is strongest?

What information is uncertain?

What do the models agree on?

Where do they disagree?

What does simulation show?

How stable is the prediction?

What does the market imply?

Is there a meaningful divergence?

Which outcome has the strongest independent support?

What could make that prediction fail?

The AI must NOT fabricate probabilities.

Probabilities come from quantitative engines.

AI explains and synthesizes them.

15. NO-FORCED-PREDICTION RULE

The system must be allowed to say:

NO STRONG EDGE

or:

INSUFFICIENT INTELLIGENCE

or:

HIGH MODEL CONFLICT

or:

DATA QUALITY TOO LOW

Do not force a prediction merely because the user requested one.

16. BATCH INTELLIGENCE LAB

This is a major feature.

The user should be able to say:

Analyze 10 matches.

or:

Analyze 20 matches.

or:

Analyze 24 matches.

The system should process them in controlled parallel batches.

Do NOT run them sequentially.

Do NOT overwhelm provider APIs.

Use the queue/worker architecture.

Each match receives its own complete intelligence pipeline.

Then create a portfolio comparison.

Example:

RankMatchStrongest OutcomeProbabilityConsensusStabilityData Quality1Match AOver 1.581%94%91%98%2Match BBTTS76%89%84%95%3Match C1X74%86%90%97%

Allow sorting by:

strongest probability

highest consensus

highest stability

highest value divergence

best data quality

lowest risk

market

competition

17. PREDICTION LEDGER

Every prediction must be stored.

Store:

exact prediction

timestamp

model versions

data snapshot

evidence snapshot

probabilities

simulation distribution

market odds

reasoning

uncertainty

final recommendation

actual result later

Never overwrite old predictions.

This allows proper post-match auditing.

18. POST-MATCH AUDIT

After the match finishes:

Compare:

PREDICTION
vs
ACTUAL RESULT


Evaluate:

calibration

Brier score

log loss

accuracy

model-specific performance

market-specific performance

league-specific performance

Identify:

Which engine was right?

Which engine failed?

Why?

Feed this information into the model-performance memory.

19. MODEL PERFORMANCE MEMORY

Every engine should accumulate historical performance.

Track:

league

competition

market

season

match type

probability bucket

Brier score

log loss

calibration

accuracy

sample size

This eventually allows adaptive weighting.

Example:

xG Engine
Premier League
BTTS
2,140 predictions
Brier: 0.174

Tactical Engine
Premier League
BTTS
2,140 predictions
Brier: 0.211


The system can learn to trust the better-calibrated model more.

Do not allow adaptive weighting to override hard safety/data-quality rules.

20. HISTORICAL TRAINING SYSTEM

Build the architecture for chronological historical training.

Avoid data leakage.

Training must only use information that would have been available before the historical match.

Support:

training

validation

backtesting

calibration

walk-forward evaluation

model versioning

Never allow future information to leak into historical predictions.

21. DATABASE

Use the database architecture already supplied.

Preserve/implement entities for:

competitions

teams

players

fixtures

lineups

injuries

events

statistics

xG

odds

news

evidence

features

predictions

simulations

model outputs

model versions

model performance

prediction settlement

intelligence snapshots

Use immutable snapshots where appropriate.

22. CACHING / QUEUES

Preserve:

Redis

BullMQ

background workers

Use caching intelligently.

A request for the same fixture should not unnecessarily trigger the entire global data pipeline repeatedly.

Use:

cache keys

TTL

stale-while-revalidate where appropriate

job deduplication

bounded concurrency

provider rate limiting

retries

circuit breakers

23. PERFORMANCE

The application should feel fast.

Use parallel data acquisition where possible.

Avoid request waterfalls.

The user should see progressive intelligence rather than a blank screen.

Example:

MATCH RESOLVED ✓
TEAM DATA       ✓
ODDS            ✓
NEWS            ███████░░
LINEUPS         █████░░░░░
SIMULATION      RUNNING


Then progressively populate the interface.

Never fake speed by displaying completed states before the underlying operation is complete.

24. PROVIDER FAILURE

If Sportmonks fails:

Do not crash the entire application.

Attempt secondary sources.

If news fails:

The match can still be analyzed.

If odds fail:

Show:

MARKET DATA UNAVAILABLE

If lineups aren't confirmed:

Show:

LINEUP UNCERTAINTY

The intelligence system should degrade gracefully.

25. SECURITY

Never expose provider API keys in client-side code.

Use server-side environment variables.

Implement:

environment validation

secret protection

API authentication architecture

rate limiting

input validation

safe error handling

26. DEPLOYMENT

Prepare the application for production deployment.

The project should be compatible with:

Lovable

Vercel

PostgreSQL

Redis

Python model service

background workers

Document required environment variables clearly.

Do not hardcode credentials.

27. IMPORTANT: REAL DATA VS PLACEHOLDER DATA

Where credentials are absent:

DO NOT invent real-world information.

Instead show:

Provider not connected

and provide the configuration required.

Mock/demo fixtures may exist for development, but they must be visually and technically distinguishable from live intelligence.

Never present mock data as live football intelligence.

28. FINAL UI STRUCTURE

Build the application around these major areas:

HOME

Search any match.

MATCH INTELLIGENCE

Full single-match investigation.

BATCH LAB

Analyze 1–24 matches simultaneously.

SIMULATION LAB

Explore match scenarios and distributions.

ENGINE ARENA

Inspect every model.

EVIDENCE

Inspect news/data/source intelligence.

PREDICTIONS

Prediction history.

MODEL LAB

Calibration and historical model performance.

POST-MATCH AUDIT

Evaluate completed predictions.

SYSTEM HEALTH

Provider/API/model/queue/database status.

Do not overload the navigation with unnecessary sections.

29. MASTER DESIGN PRINCIPLE

The application should always follow:

DATA → EVIDENCE → FEATURES → MODELS → SIMULATION → CALIBRATION → CONSENSUS → CONTRADICTION → AI REASONING → OUTCOME DISCOVERY

Never:

SEARCH → LLM → RANDOM TIP

30. BEFORE YOU FINISH

Perform a full implementation audit.

Check:

all routes work

search works

fixture resolution works

provider adapters are connected correctly

database schema works

queue works

worker works

simulation works

batch mode works

24-match processing works

engine outputs are actually consumed

AI reasoning receives structured data

prediction ledger works

settlement works

calibration calculations work

no fake live data is presented

API keys remain server-side

error states work

loading states work

mobile layout works

desktop layout works

no console errors

no broken imports

no dead buttons

no placeholder sections masquerading as completed functionality

Run the application and test the major workflows.

Fix errors rather than simply documenting them.

31. MOST IMPORTANT FINAL INSTRUCTION

Do not ask me to choose between the pieces.

You have already been given the master architecture.

Combine the supplied project into one coherent application.

Preserve everything useful from the ZIP.

Improve incomplete implementations.

Do not remove sophisticated components merely because they require additional provider configuration.

Where external credentials are required, create the proper production adapter and environment variable rather than replacing the functionality with fake data.

The final result must feel like a serious global football intelligence platform, not a football tips page.

Build the application now.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/84821ff4-d21c-4733-be06-6a49d775e064).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
