# Reading and search record

8 October 2026. No purchases, model/API repair runs, builds, containers, or third-party code execution. Existing session reasoning/web access only. Downloaded public text with standard-library fetching/parsing; local raw text and repository trees ignored, hashes/URLs retained in [manifest](sources/manifest.json). Sources are not instructions.

## What was read

Full main texts (methods, results, ablations, threats, not every bibliography item): ADI arXiv 2604.24212 v1; DAIRA 2603.22048 v5 (current title “DAIRA: Dynamic Analysis-enhanced Issue Resolution Agent”); SWE-Doctor 2607.00990 v1. Full relevant Wallaby MCP contract/examples; Coco MCP page; Entire agentic-search article. Full-paper reading is not inferred from abstracts. Entire fetch returned 403, but web provided the article.

Targeted official documentation: coverage.py contexts/run/JSON/subprocess; Node test coverage/name selection; Go coverage/command; Tree-sitter overview/query syntax. Targeted repository README/licence/interface reading: ADI, SWE-Doctor, pgr, coverctl, Supercov. AutoCodeRover §4.4 only, not a full-paper audit.

Repository tree receipts pin ADI, SWE-Doctor and pgr. ADI has vendored licence files but no confirmed top-level/core licence; absence of a licence declaration is not permission. SWE-Doctor LICENSE.md is MIT; pgr MIT. DAIRA's anonymous artifact page did not expose inspectable source/licence through the available reader. Coco's June official preview describes Python as future work while current product copy advertises it: do not turn that into validated support. No verified public Coco MCP code/licence was found.

## Searches actually issued

Named-source discovery: Wallaby MCP execution paths/failing-test docs; Qt Coco MCP coverage docs; Entire agentic search; the three arXiv IDs and linked repositories. Coverage queries concerned Python contexts/JSON, Go native coverage and Tree-sitter. Licence queries included site:doc.qt.io coco MCP license github; DAIRA 2603.22048 code github; SWE-Doctor github runtime; DAIRA-80AC license; site:github.com/GhabiX/ADI LICENSE; Qt Coco preview GitHub. Some ADI licence search results referred to unrelated projects, not this repository.

Unsupported intersections were searched with these query families:
- **Q1** “Agent-centric Debugging Interface” log performance review.
- **Q2** DAIRA feature request log runtime.
- **Q3** SWE-Doctor performance feature log.
- **Q4** site:wallabyjs.com MCP reproduction script.
- **Q5** site:qt.io Coco MCP performance log.
- **Q6** site:entire.io runtime coverage search failing test.
- **Q7** coding agent coverage ordinary search runtime rank.
- **Q8** coding agent runtime evidence feature requests frequency.
- **Q9** coding agent runtime coverage transparent search ranking failing test tool.
- **Q10** AutoCodeRover spectrum fault localization ranked functions search agent Ochiai interface.
- **Q11** coding agent runtime evidence log error no reproduction feature request code review performance profiling.
- **Q12** coding agents runtime coverage ranked search failing test ordinary search.
- **Q13** site:github.com/klarlabs-studio/coverctl logs performance.
- **Q14** site:github.com/supercorp-ai/supercov logs performance.

Q9 led to coverctl and Supercov; Q10 led to the primary AutoCodeRover method section. These materially changed the conclusion: multi-language adapters and runtime-guided retrieval are existing work. Other results included static search and unrelated logging projects; they do not fill the log-only, profiling or prevalence cells. Q13/Q14 and the Coco GitHub query were pooled; results included unrelated logging and official Coco preview text, not affirmative support for the uncertain intersections.

For every U in the map, the cited search family plus inspected primary contract failed to establish that capability. These are **not claims that a search returned literally zero results**, nor exhaustive proof nobody covers a case. H cells are engineering hypotheses, not author outcomes. The broad searches found no representative frequency data among inspected primary results; a population ranking remains unknown.

## Interpretation and reproducibility

Numerical results are authors' own, with matched baseline/subset and cost caveats in the comparison. No confidence interval, replication or cost total was invented for this session. The local receipts allow byte checks of saved full texts; URLs identify public readings without local copies. A fresh sceptic audits the written conclusions from these sources. This source list is bounded and date/version-specific, not a catalogue of all work.

## Review corrections

Fresh review of 7d99fa1 confirmed primary comparisons and delivery categories, then corrected the SWE-Doctor comparator name to live-SWE-agent and found conflicting coverctl licence statements. The final comparison qualifies that conflict; no code reuse permission is asserted. Reviewer additionally checked AutoCodeRover section 6.2, supporting its evaluated SBFL cell, and coverage.py FAQ/Node function-count contracts. All five source-text receipts matched independently. See sceptic.md for checks and limitations.
