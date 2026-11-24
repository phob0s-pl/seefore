# B4b: The layout of the diagram

A stage between B4 and B5 of `plan2.md`: the diagram of B4 is laid out so that it can be read.
The owner asked for a study of layouts on 2026-11-23 (`research/layout/`, out of Git): Fable
and Astra on the strategy, eight testers, and three judges who compared pictures blind. The
owner liked its recommendation and asked for it to be built. Builder: Opus.

## What you can do after it

Open the page at the Systems depth and see three bands: people on the left, our systems in
the middle, external systems on the right. Read the names without zooming on most models.
At the two deeper depths, find the people on the left and pan through far less.

## The algorithm

1. **ELK's layered layout stays**: left to right, lines at right angles, frames laid out
   together with what is around them.
2. **Options, set on the diagram and on every frame**: thoroughness 50, the network simplex
   placement of boxes, random seed 1.
3. **Gaps**, on the diagram and on every frame: 8 pixels between boxes in a column and 120
   between columns. Lines that run between columns stand 24 apart and keep 28 from a box;
   lines that run beside the boxes of a column stand 6 apart and keep 8. A frame has 56 at
   its top, 60 at its sides and 20 at its foot. The horizontal gaps are those of the owner's
   earlier tool: the owner chose them on 2026-11-24 over the tight ones of the study (24, 6, 8
   and 20), which fit more on a screen.
4. **A box with many lines grows taller**, so that its line ends stand 12 pixels apart. The
   page draws a box at the size the layout gives.
5. **A pair of boxes with arrows both ways is one line with a head at each end.** It stands
   for the connections of both directions.
6. **Three zones.** A person is in the first. An external system that only calls ours (it has
   an arrow to one of our systems and none from them) is in the first too. Our systems are in
   the second. Every other external system is in the third. A piece of infrastructure that is
   in no system is ours.
7. **At the Systems depth the zones are columns in that order**, and each has a painted band
   behind its boxes with a title: "People", or "People and callers" when it holds a system;
   "Our systems"; "External systems". A zone with nothing in it has no band.
8. **A long column is split only when the picture is too tall** for the field's shape, which
   is 1.415 to 1. Then its boxes are dealt into two or three columns in their own order, for
   columns of more than 10, of more than 8 and of more than 6 boxes. Of these and the first
   layout, the one that fits the field best is kept; of two that fit alike, the one with
   fewer crossings.
9. **Below the Systems depth** people are held in the first column, and everything else
   stands where ELK puts it. There are no bands.

The same model gives the same picture: nothing depends on the size of the window.

## What is in

- **In `src/model/`**: the function that says what a view shows gives each arrow its two
  directions, and each box that stands at the top its zone.
- **In `src/ui/`**: the layout above. It takes the layout engine as a value, so that tests can
  run it without a browser. The page draws the bands, a head at the start of a two-way line,
  and boxes at the size the layout gives.
- **The outline of a box has the colour of its kind**, as in the pictures of the study: a
  person blue, a system green, an app amber, a store violet, a component light blue, a piece
  of infrastructure grey. A frame has a quiet dashed outline. The owner asked for it on
  2026-11-24.

## What is out

- **The store rule** (a store between those who write it and those who read it), and **lines
  that share an end run together**: the owner put both off.
- **An outside system held to one side at every depth.** It cost 186 crossings in the study.
- **Anything a click does**, names on arrows, and everything else B4 left out.

## Tests, about ten

What a view shows: a two-way pair is one arrow with both directions; a one-way pair is not;
the zone of a person, of ours, of a caller, of another outside system. The layout, run with
ELK in Node on small models written inline: at the Systems depth no box of a later zone
stands left of a box of an earlier one; a long column is split when the picture is too tall
and not when it is wide; the same model twice gives the same places; a busy box is taller.
The browser test of B4 still passes, and also finds a band's title.

## The try

The study measured this layout on 21 cases, seven public models at three depths. The built
layout was measured the same way, and on the private model. With the study's tight gaps it
gave the study's numbers exactly. The last column is what is built now, with the wider
horizontal gaps the owner chose.

| What is measured | The page of B4 | The study, tight gaps | Built, wider gaps |
| --- | ---: | ---: | ---: |
| Crossings, all cases | 4,718 | 4,169 | 4,259 |
| Cases whose names can be read at fit | 1 | 6 | 4 |
| Screens at reading size, all cases | 263 | 78 | 124 |
| Systems views with every box in its zone's order | no zones | 7 of 7 | 7 of 7 |
| An arrow's end off its box, boxes that overlap, a box outside its frame | 0 | 0 | 0 |
| The slowest layout, in the browser | under 1 s | about half a second | not timed again |

A picture of each depth was read on the private model and on two public ones.

## Choices, as the owner took them

1. **The store rule comes later**, as a stage of its own.
2. **Outside systems that only call ours stand with the people.**
3. **No shared trunks for lines.**
