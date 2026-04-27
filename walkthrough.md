# MusicMesh Operator Workbench Walkthrough

This walkthrough shows the main paths a human user can trigger in the MusicMesh Operator Workbench. It uses a clean Athens, Georgia music-scene run with:

- `R.E.M.`
- `The B-52's`
- `Pylon`
- `Athens, Georgia`

The screenshots are annotated so you can follow the workflow visually first, then use the short text under each image as confirmation.

## Full Visual Sequence

Use this contact sheet as the quick map of the complete walkthrough.

![Contact sheet of the full Operator Workbench walkthrough](docs/assets/walkthrough/operator-workbench/00-contact-sheet.png)

## 1. Start On The Operator Workbench

Open `http://127.0.0.1:3000/`. The default screen keeps chat on the left and the workbench on the right.

![Default Operator Workbench screen](docs/assets/walkthrough/operator-workbench/01-start-default-screen.png)

What to do:

1. Use the left side for questions.
2. Use the right side to switch between `Graph`, `Proposals`, and `Workflow`.
3. Type into the composer at the bottom-left.

## 2. Ask The Athens Scene Question

Type the Athens prompt into the chat composer.

![Athens prompt entered in chat](docs/assets/walkthrough/operator-workbench/02-chat-prompt-ready.png)

Prompt used in this walkthrough:

```text
How do R.E.M., The B-52's, Pylon, and Athens, Georgia connect as a music scene? Give a concise answer and prepare graph-worthy relationship proposals.
```

Click `Send`.

![MusicMesh thinking after the prompt is sent](docs/assets/walkthrough/operator-workbench/03-chat-thinking.png)

When the answer completes, read it in the live operator thread while the graph workspace stays visible.

![Completed chat answer](docs/assets/walkthrough/operator-workbench/04-chat-answer-complete.png)

Expected result:

- The answer explains the Athens scene connection.
- MusicMesh prepares graph-worthy relationships for review instead of silently canonizing them.

## 3. Create A Proposal From Entities

Switch to `Proposals`.

![Proposals tab open](docs/assets/walkthrough/operator-workbench/05-proposals-tab-open.png)

Enter the Athens entity list and context.

![Proposal fields filled](docs/assets/walkthrough/operator-workbench/06-proposals-fields-filled.png)

Entity list:

```text
R.E.M.
The B-52's
Pylon
Athens, Georgia
```

Context:

```text
Create graph-worthy music relationships for the Athens, Georgia music scene. Prefer LLM reasoning about entity meaning and relationship intent. Do not create duplicate relationship-as-entity nodes.
```

Click `Create Proposal`.

![Generated proposal summary](docs/assets/walkthrough/operator-workbench/07-proposal-created.png)

Expected result:

- A latest proposal appears.
- Candidate relationships are shown for review before apply.

## 4. Approve And Apply The Proposal

Click `Approve all pending`.

![Proposal approved](docs/assets/walkthrough/operator-workbench/08-proposal-approved.png)

Click `Apply approved`.

![Proposal applied](docs/assets/walkthrough/operator-workbench/09-proposal-applied.png)

Expected result:

- Approved graph items are persisted.
- The graph workspace can now show the applied proposal structure.

## 5. Inspect The Graph

Switch back to `Graph`.

![Graph after applying proposal](docs/assets/walkthrough/operator-workbench/10-graph-after-apply.png)

Expected result:

- The graph contains the applied Athens proposal.
- Domain entities are shown as graph nodes.
- Proposed relationship records are not displayed as fake relationship-as-entity nodes.

Click `Browse` to open filters and the legend.

![Browse filters and legend](docs/assets/walkthrough/operator-workbench/11-graph-browse-filters.png)

Use the node-kind filters when you want to focus the view.

![Node-kind filters focused](docs/assets/walkthrough/operator-workbench/12-graph-proposalitem-filtered.png)

The legend explains the color coding:

- Artist / Band
- Album / Release
- Track / Song
- Person / Member
- Record label
- Scene
- Venue
- Genre / Other typed node
- Proposal workspace

## 6. Inspect, Expand, Fit, And Reset

Click `Inspect`, then click a graph node or relationship.

![Inspect drawer with graph selection](docs/assets/walkthrough/operator-workbench/13-graph-inspect-selection.png)

Expected result:

- The inspect drawer opens.
- Selection details appear when a node or relationship is selected.

Close the inspect drawer if it covers toolbar controls, then click `Expand`.

![Expanded graph neighborhood](docs/assets/walkthrough/operator-workbench/14-graph-expand.png)

Click `Fit` to frame the current graph.

![Fit graph view](docs/assets/walkthrough/operator-workbench/15-graph-fit.png)

Click `Reset` to return the layout to its default framing.

![Reset graph layout](docs/assets/walkthrough/operator-workbench/16-graph-reset.png)

## 7. Check Workflow Evidence

Switch to `Workflow`.

![Workflow evidence tab](docs/assets/walkthrough/operator-workbench/17-workflow-tab.png)

Expected result:

- Recent conversation events are visible.
- Recent runtime events confirm the user-triggered flow.
- This is the place to check what happened after a chat, proposal, review, apply, or graph action.

## 8. If A Graph Operation Blocks

If graph tooling hits a blocker, the correct behavior is to stop and ask the human for next steps in the chat thread.

![Human-in-the-loop blocker note](docs/assets/walkthrough/operator-workbench/18-human-loop-note.png)

Do not treat a blocked graph operation as success. Confirm the visible graph and the Workflow evidence before calling the run complete.

## Successful Outcome Checklist

The walkthrough is successful when:

- The clean database starts empty.
- The Athens proposal can be created from the `Proposals` tab.
- Pending proposal items can be approved and applied.
- The graph shows domain entities with useful color coding.
- Relationship records do not appear as duplicate relationship-labeled entity nodes.
- The Workflow tab shows fresh evidence from the walkthrough run.
- Neo4j contains persisted nodes and relationships after apply.
