# LinkedIn post draft (Section 2.1 positioning — edit into your voice)

Headline: Swarmway v1.0.0 — an interactive 3D workbench for optimal
multi-agent path finding, now live on GitHub Pages.

The body (adapt to your voice):

I built Swarmway to make "CBS is optimal" something you can actually watch,
not just read. It's an interactive 3D workbench for multi-agent path finding:
a pure-Python Conflict-Based Search solver with an independent validity
checker and brute-force optimality cross-checks, plus a React frontend that
lets you play, pause, and scrub the constraint tree as collisions are resolved
constraint by constraint.

I benchmarked it honestly against a Prioritized Planning baseline on 24
MovingAI MAPF cells (60 s budget): CBS is optimal for sum-of-costs where it
solves (median SoC 226) but times out on hard cells — timeouts count as
failures and stay in the denominators, never dropped. Every number in the
README cites a committed run ID (20261105-1754-5db8a24-dirty-headline); none
is hand-typed.

The public site is offline-first: it works with no backend running (bundled
traces + benchmarks play immediately), which is the recruiter experience on a
phone.

Live site: https://Vedant-Divate.github.io/SwarmWay/
Repo: github.com/Vedant-Divate/SwarmWay

#MultiAgentPathFinding #CBS #Robotics #Algorithms #OpenSource
