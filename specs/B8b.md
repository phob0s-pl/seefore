# B8b: The focus keeps its choice

A stage after B8. The owner looked at the Components depth of a model of real size on
2026-11-26 and said: "on components the filter disappears. I'd have: all + everything what
has component inside to filter it and show + its neighbour". Fable and Astra each said what
would read best (out of Git), and the owner said to build what they came to. It changes two
choices of B8: that Components shows everything after a system was chosen at Containers, and
that the click panel has no button to a deeper view.

## What you can do after it

Choose a system at Containers, go to Components, and still see that system, now with its apps
opened. Choose one app there from a list that stands under its system. From a box you are
reading, open the view of it with one button. See on a closed box that it has an inside.
See in a component's panel what the flows do in it.

## What is in

- **The tabs of the depths keep the choice.** A system chosen at Containers is the focus at
  Components too: its frame, with each of its apps that holds something opened. An app chosen
  at Components means its system at Containers, as before. Systems has no focus, and the back
  arrow returns to the view before.
- **A system is a choice at Components**, each one that Containers offers. One whose apps hold
  nothing shows what it shows at Containers.
- **Of the apps, only one that holds a component is a choice.** An app that holds only a store
  is opened in the view of its system and of the whole model, and its id in the address means
  its system.
- **The menu at Components is in two levels**: the systems by name, and under each, set in,
  its apps that hold a component, by name.
- **The first choice is "Whole model"** at both depths, and it is still the default.
- **Around a focus stand its neighbours as B8 has them**: closed, each with a line to it, and
  no line between two of them. Around a system at Components they are what they are at
  Containers.
- **An id in the address that is no choice means the nearest thing it is in that is one**, at
  both depths: a component its app, a store in an app that app or its system.
- **The click panel of a box that can be the focus has a button to that view**, before the
  button to its page: "Show its containers" on a system with something in it, "Show its
  components" on an app with a component. It is there on a closed box and on a frame. It is
  not there in the view the button would open.
- **A closed box that can be the focus bears a small stack** at its lower right, which says
  "Has containers inside" or "Has components inside".
- **The panel of a part lists the steps that happen in it**: each step of a flow that names
  the part in `does`, with what happens, the flow and the step's number. A row opens the flow
  on that step. Only on the Architecture page.
- **In `src/model/`**: what can be the focus at a depth, the choices in their two levels, the
  focus an address means, the depth a box opens at, the address of the diagram, and the steps
  in a part.

## What is out

- **Another default.** The whole model stays what a depth opens on, also where it cannot be
  read when fitted.
- **The apps that hold only a store, as choices.** Astra would keep them, each with a word on
  what it holds, since Components is the one depth that draws their stores. They were left
  out: such a view adds one box with no line to what Containers shows.
- **A line to a component that the flows imply.** A line is a connection of the model.
- **The button and the stack on the page of a flow**, and under a change.
- **A double click that opens a box.**

## Tests, about ten

The functions, on small models written inline: the choices at each depth, with the apps under
their systems; an app with only a store is no choice and means its system; a system at
Components has its apps opened and another system closed; the depth each box opens at, and
none on the focus at its own depth; the address of the diagram; the focus an address means,
at both depths; the steps in a part. In the browser: a system with parts bears the stack, its
panel's button opens its view, the tab of Components keeps it and the tab of Systems lets it
go.

## The try

On a public model of 513 records, drawn in Chrome and read:

| View at Components | Boxes | Zoom when fitted |
| --- | --- | --- |
| The whole model | 153 | 0.09 |
| One system, of 7 | 18 to 39 | 0.30 to 0.54 |
| One app, of the 13 that hold a component | 6 to 14 | 0.67 to 1.00 |

The menu holds the whole model, 7 systems and 13 apps, where it held 25 apps. No connection
of this model ends at a component, so a component has no line, and its panel lists the steps
of the flows that name it.

## Choices

1. **A system is a choice at Components.** Without it the tab would have to drop the choice
   or change it to something the person did not choose.
2. **Thirteen apps and not twenty-five**, as above.
3. **The button is back**, against B8. With it a person goes from the box they read to its
   view; without it they must find its name again in the menu.
4. **The button names what it shows and not the box**: the panel's heading has the name, and
   a long name would not fit a button.
5. **A system's button always opens its view at Containers, an app's at Components**, also
   from a frame at a deeper depth: one button, one place.
