# Code Visualizer Project Requirements

## Purpose of this document
This document defines the full working agreement for building the code visualization product. It is written so every person on the team can understand:
- what the product should do,
- what each role must deliver,
- how data should move between parts,
- what decisions must stay consistent,
- and how to avoid conflicts when the work comes together.

This version covers only the product up to the point where the user can visually see their code structure and connections.
It does **not** include any AI explanation or AI assistance features.

---

## 1) Product goal
The product should help a user open code and see it as a visual graph instead of only reading raw text.

The visualizer should show:
- files
- components
- functions
- event handlers
- routes or API calls where applicable
- connections between these items
- missing or unconnected parts
- a clear visual path from one part of the code to another

The main idea is:
- user gives code
- system analyzes structure
- system converts it to nodes and edges
- user sees a graph
- user can click or inspect items to understand flow

---

## 2) Shared product understanding
Every team member must understand these rules before coding starts:

1. The app must be modular.
2. The app must share one common data format for graph data.
3. The frontend must not guess structure on its own.
4. The backend/parser must return stable, predictable JSON.
5. The UI must be able to render partial data without breaking.
6. The project must support teamwork without everyone editing the same files.
7. Every role should work on a separate responsibility area.
8. All naming should stay consistent across frontend, backend, and shared data.

---

## 3) Final user experience target
The final product should allow a user to:
- open a file or project
- press a button like “Visualize”
- see a graph of code relationships
- zoom, pan, and inspect nodes
- click a node and highlight related nodes/edges
- understand which parts are connected and which are not

The product should feel clean, fast, and easy to understand.
The graph should not feel cluttered or confusing.

---

## 4) Common data contract for everyone
This is the most important shared agreement in the project.

Every part of the system must work with the same graph structure.

### Required graph format
- `nodes`: list of node objects
- `edges`: list of edge objects

### Node object should include
- `id`: unique identifier
- `label`: readable text shown in UI
- `type`: such as file, function, component, route, event, api-call, or other agreed type
- `filePath`: source file where it came from, if available
- `metadata`: optional extra details

### Edge object should include
- `from`: source node id
- `to`: target node id
- `type`: relationship type such as calls, imports, triggers, renders, routes-to, or uses
- `label`: readable relationship name, if needed
- `metadata`: optional extra details

### Shared rules for the data contract
- IDs must be stable and unique.
- Labels must be human-readable.
- Type names must be fixed and not changed randomly.
- Every module must send and receive this same structure.
- The frontend should not depend on extra fields that are not documented.

---

## 5) Visual rules for the graph
The graph must follow these visual rules:
- clear separation between nodes and edges
- readable labels
- good spacing between nodes
- support zoom in and zoom out
- support pan and drag
- connected parts should be easy to trace
- missing links should be visibly different from connected links
- large graphs should remain usable
- color and shape should indicate node category

### Suggested visual language
- files can use one shape or color
- components can use another
- functions can use another
- event nodes can use another
- route/API nodes can use another
- missing or broken connections should be highlighted clearly

The visual system must be consistent across the whole app.

---

## 6) Frontend developer responsibilities
The frontend developer is responsible for everything the user sees and interacts with.

### Main responsibilities
- build the graph display area
- render nodes and edges from incoming JSON
- create interaction controls such as zoom, pan, select, and reset
- show file/project loading states
- display errors gracefully
- handle filtering, searching, and layout controls if included
- keep UI responsive and clean
- support large graphs without freezing the page

### Frontend step-by-step work

#### Step 1: Build the base layout
Create the page layout first.
The page should include:
- top bar or header
- upload/open section or project input section
- main graph area
- optional side panel for node details
- optional controls panel

Do not start with animation first.
Start with structure.

#### Step 2: Build the graph container
Create the main area where the graph will appear.
It should be large enough to handle many nodes.
It should resize properly on different screen sizes.

#### Step 3: Add empty states
Before data is loaded, show useful messages like:
- no project loaded
- waiting for graph data
- no connections found

#### Step 4: Add graph rendering
Connect the frontend to the shared graph format.
Render nodes and edges from JSON.
The frontend must not modify the graph structure silently.

#### Step 5: Add node selection
When a node is clicked:
- show its label
- show its type
- show file path if available
- highlight connected nodes and edges

#### Step 6: Add edge inspection
When possible, let users inspect the edge type.
If an edge is missing or broken, show that clearly.

#### Step 7: Add controls
Include controls such as:
- zoom in
- zoom out
- fit to screen
- center view
- reset highlights
- search node by name
- filter by type

#### Step 8: Handle large graphs
The frontend must support:
- lazy rendering if needed
- node grouping or collapsing
- clustering of related items
- performance-friendly updates

#### Step 9: Handle loading and errors
The UI must show:
- loading spinner or progress state
- parser error messages
- invalid JSON message
- empty graph message
- file-read error message

#### Step 10: Keep the UI consistent
All buttons, panels, labels, and colors should follow one design system.

### Frontend requirements to remember
- Do not hardcode node data.
- Do not assume every project looks the same.
- Make the graph readable first, pretty second.
- Keep state changes predictable.
- Use the shared JSON contract exactly.

---

## 7) Backend or parser developer responsibilities
The backend developer is responsible for turning code into structured graph data.

### Main responsibilities
- read source code files or project structure
- parse code into meaningful entities
- identify functions, components, imports, routes, event handlers, and calls
- build nodes and edges from the source
- return clean graph JSON
- report parse errors clearly

### Backend step-by-step work

#### Step 1: Decide supported input scope
Start with one language or one framework family first.
For example:
- plain JavaScript
- React project structure
- Node.js Express route structure

Do not begin with every language at once.

#### Step 2: Parse files safely
Read code files and extract structural elements.
The parser should not depend on the frontend.

#### Step 3: Identify code entities
Find things such as:
- file names
- function declarations
- component declarations
- event handlers
- imports and exports
- route definitions
- function calls
- API calls

#### Step 4: Build graph nodes
Convert each entity into a node.
Every node must have a stable ID and a readable label.

#### Step 5: Build graph edges
Create edges for real relationships such as:
- file imports file
- function calls function
- component renders component
- event triggers handler
- handler calls API
- route maps to controller

#### Step 6: Validate relationships
The backend should avoid fake or guessed connections.
Only create an edge if it is supported by the parsed code.

#### Step 7: Return standardized JSON
The backend response must match the shared graph contract.
If information is missing, return empty arrays or null values clearly instead of inventing data.

#### Step 8: Handle parse errors
If code cannot be parsed:
- return a helpful error
- indicate file and line if possible
- do not crash the whole system

#### Step 9: Support project-level analysis
When the codebase has multiple files, build cross-file relationships if possible.

### Backend requirements to remember
- Return predictable data.
- Keep output stable for the same input.
- Use the shared schema exactly.
- Never change field names without team agreement.
- Keep parsing logic separate from UI logic.

---

## 8) Integration developer responsibilities
The integration developer connects the backend and frontend and makes the whole product work as one system.

### Main responsibilities
- define request and response flow
- connect graph output to graph UI
- make sure file data moves correctly through the system
- manage endpoint calls if a backend exists
- manage shared types or schema files
- keep versions of frontend and backend compatible

### Integration step-by-step work

#### Step 1: Freeze the data contract
Before integration starts, everyone must agree on the exact graph JSON format.

#### Step 2: Create the communication flow
Define how graph data moves:
- frontend sends file/project data
- backend parses and responds
- frontend renders graph

#### Step 3: Test dummy data first
Before connecting real parser output, use mock graph data in the frontend.
This lets UI work independently.

#### Step 4: Connect real API or parser output
Replace mock data with actual backend response.
Check that every field matches.

#### Step 5: Handle mismatch issues
If frontend expects one field and backend sends another, fix the shared schema, not one side only.

#### Step 6: Test full flow
Test the entire pipeline:
- load project
- parse code
- receive JSON
- render graph
- click nodes
- show details

#### Step 7: Maintain compatibility
If one module changes, update dependent modules carefully.

### Integration requirements to remember
- Protect the shared schema.
- Keep endpoints simple.
- Avoid hidden transformations.
- Log problems clearly.
- Help other roles test early.

---

## 9) UI/UX designer responsibilities
The UI/UX person ensures the product is understandable, pleasant, and easy to use.

### Main responsibilities
- design layout and navigation
- define colors and node styles
- choose spacing and typography
- make the graph easy to read
- improve usability for beginners
- help reduce clutter

### UI/UX step-by-step work

#### Step 1: Define screen layout
Decide where the graph, controls, and details panel should go.

#### Step 2: Define node visual styles
Different node types must be visually distinct.

#### Step 3: Define states
Design how the UI looks in these states:
- loading
- empty
- error
- graph loaded
- node selected
- broken connection shown

#### Step 4: Reduce clutter
Use grouping, spacing, and simple controls.
Do not overload the user with too many buttons.

#### Step 5: Support clarity first
The graph should make code easier to understand, not harder.

### UI/UX requirements to remember
- Prioritize readability.
- Keep colors consistent.
- Make selected paths obvious.
- Keep controls discoverable.
- Use simple language in labels.

---

## 10) QA and testing responsibilities
Testing is needed to make sure the modules connect without surprises.

### Main responsibilities
- verify graph JSON structure
- test parser output on sample projects
- test frontend rendering with mock and real data
- test node click behavior
- test edge highlighting and filtering
- test broken input and error states
- test performance with larger data

### QA step-by-step work

#### Step 1: Prepare sample projects
Keep small test projects for repeatable testing.

#### Step 2: Verify output structure
Check that nodes and edges are correctly formed.

#### Step 3: Check visual behavior
Make sure the graph loads and interactions work.

#### Step 4: Check edge cases
Test empty files, malformed files, missing imports, and no-connection cases.

#### Step 5: Check compatibility after changes
When one module changes, run tests again.

### QA requirements to remember
- Test early, not only at the end.
- Keep sample fixtures ready.
- Report exactly where the flow breaks.

---

## 11) Shared development rules for all roles
These rules apply to every person on the team.

### Rule 1: Work in separate modules
Each role should own a clear area.
Do not edit other people’s files unless needed for integration.

### Rule 2: Use mock data early
Frontend should not wait for backend to finish.
Backend should not wait for final UI polish.

### Rule 3: Keep naming consistent
Use the same terms across the whole project.
Example:
- if one side says `function`, do not rename it to `method` somewhere else without agreement
- if one side uses `edges`, keep that exact field name

### Rule 4: Document decisions
Every important decision must be written down.
Examples:
- supported language
- node types
- edge types
- file scope
- input method
- error message format

### Rule 5: Do not guess silently
If a module cannot determine something, it should leave it empty or mark it as unknown.
It should not invent fake relationships.

### Rule 6: Keep progress visible
Every person should share what they changed and what they need from others.

### Rule 7: Build from the same source of truth
The shared schema document is the source of truth.

---

## 12) Collaboration workflow
This is the recommended order for team work.

### Phase A: Planning
- agree on product scope
- choose supported code type first
- decide graph data schema
- define node types and edge types
- decide UI layout

### Phase B: Independent build
- frontend builds graph page with mock data
- backend builds parser and JSON output
- integration prepares API or data bridge
- UI/UX defines visual style
- QA prepares test cases

### Phase C: First connection
- connect backend output to frontend graph
- verify field mapping
- fix mismatches

### Phase D: Feature expansion
- add highlighting
- add filtering
- add search
- improve grouping and readability

### Phase E: Stabilization
- test everything
- remove unused fields
- polish labels and states
- check performance

---

## 13) What each role must deliver before merge

### Frontend deliverables
- working graph view
- node selection behavior
- loading and error states
- basic controls
- ability to render mock and real graph JSON

### Backend deliverables
- parser output in agreed JSON format
- stable node and edge generation
- error handling
- sample output files for testing

### Integration deliverables
- working data flow between modules
- documentation of endpoints or data path
- compatibility check between schema and UI

### UI/UX deliverables
- layout decisions
- node color/type system
- interaction patterns
- empty/loading/error state design

### QA deliverables
- test cases
- sample files
- validation checklist
- bug report format

---

## 14) Things that must be decided early
The team should decide these early so work does not break later:
- first supported language/framework
- exact graph schema
- node types
- edge types
- color palette
- graph layout behavior
- how to handle missing data
- what counts as a connection
- how file/project input is given
- how errors are shown

---

## 15) Recommended first scope
To keep the project manageable, start with:
- JavaScript or React project only
- function and component detection first
- imports and event handlers next
- simple graph rendering
- click-to-inspect behavior
- basic connection highlighting

Do not start with:
- multi-language support
- advanced code understanding
- AI explanation
- huge enterprise codebases

---

## 16) Final success condition
The project is ready for the first complete version when:
- a user can load code
- the system can parse it
- the system can build a graph
- the frontend can display that graph
- node selection works
- connections are visible
- the UI remains understandable
- team members can work independently without breaking each other’s work

---

## 17) Team agreement summary
Everyone must agree to the following:
- one shared graph format
- one shared naming system
- separate module ownership
- mock data first for frontend
- parser output must be stable
- UI must stay readable
- no hidden assumptions
- no AI features in this version
- goal is visual code understanding only

---

## 18) Simple handoff note for the team
When a role finishes work, they should hand off:
- what they built
- what files changed
- what data format they expect
- what problems remain
- what the next person should not change

This avoids confusion and helps the final connection work smoothly.

