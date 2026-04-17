# Playbook: Design an Interface
This is a portable procedural playbook. It is not runtime-loaded unless your tooling explicitly loads it.

Use this only when the operator explicitly asks for an interface-design pass, especially when the module boundary is the hard part.

1. Gather requirements first:
   - what problem the module solves
   - who the callers are
   - what operations are needed
   - what constraints matter
   - what should stay hidden internally
2. Check the repo for nearby patterns before proposing new shapes.
3. Produce 2-4 materially different interface designs.
4. For each design, show:
   - interface shape
   - small usage example
   - what complexity is hidden
   - major trade-offs
5. Compare the designs in prose, focusing on:
   - simplicity
   - correctness pressure
   - depth vs shallow surface area
   - fit with existing Stima patterns
   - testability at the boundary
6. Recommend one design and explain why.
7. If no design is clearly better, say what decision input is still missing.

Do not make this an automatic workflow step. This is an optional design aid for tricky boundaries.

Repo docs win over this playbook if wording conflicts.
