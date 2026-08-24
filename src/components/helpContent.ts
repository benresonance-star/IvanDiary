export type HelpTip = {
  title: string;
  body: string;
};

export const HELP_TIPS = {
  "help-intro": {
    title: "Help is on",
    body: "Tap a button or control to learn what it does. Nothing will change while Help is on.",
  },
  navigation: {
    title: "Open the App menu",
    body: "Use this menu to move between your journal, sketchbooks, favourites, and settings.",
  },
  "canvas-background": {
    title: "Canvas background",
    body: "See this page’s background colour. Tap it in Edit mode to choose a colour or restore the paper’s default.",
  },
  "nav-diary": {
    title: "My Daily Journal",
    body: "Open your dated journal pages.",
  },
  "nav-story": {
    title: "My Stories",
    body: "Create, open, rename, arrange, and favourite your stories.",
  },
  "nav-sketchbooks": {
    title: "My Sketchbooks",
    body: "Open your free-form sketchbooks.",
  },
  "nav-favourites": {
    title: "My Favourites",
    body: "See pages, sketchbooks, and stories you have marked with a thumbs-up.",
  },
  "nav-settings": {
    title: "My Settings",
    body: "Adjust the App to make it comfortable for you.",
  },
  view: {
    title: "View",
    body: "Read and use the page without moving or changing its objects.",
  },
  arrange: {
    title: "Edit",
    body: "Move, resize, edit, or remove items on this page. To explore those controls, enter Edit first, then turn Help on.",
  },
  draw: {
    title: "Draw",
    body: "Draw with your selected pen. Tap Draw again to open pen and grid settings.",
  },
  erase: {
    title: "Erase",
    body: "Remove parts of your drawing with your finger or Apple Pencil.",
  },
  photo: {
    title: "Image",
    body: "Add an image from this iPad to the page.",
  },
  link: {
    title: "Link",
    body: "Add a website link to the page.",
  },
  text: {
    title: "Text",
    body: "Add typed or spoken text to the page.",
  },
  voice: {
    title: "Voice",
    body: "Record a voice note and place it on the page.",
  },
  undo: {
    title: "Undo",
    body: "Reverse your most recent drawing or editing change.",
  },
  redo: {
    title: "Redo",
    body: "Restore the drawing change you most recently undid.",
  },
  share: {
    title: "Share",
    body: "Send this page as a picture or PDF.",
  },
  favourite: {
    title: "Favourite",
    body: "Add or remove this page from My Favourites.",
  },
  calendar: {
    title: "Calendar",
    body: "Choose another journal date to view.",
  },
  "page-strip": {
    title: "Page",
    body: "Open this page. In Edit mode, page controls can also reorder or remove it.",
  },
  "add-page": {
    title: "Add a page",
    body: "Create another page for this date or sketchbook.",
  },
  "pen-tab": {
    title: "Pens",
    body: "Choose how your pen looks and whether you can draw with a finger.",
  },
  "grid-tab": {
    title: "Grids",
    body: "Show and adjust a guide for straight drawing.",
  },
  "shape-tab": {
    title: "Shapes",
    body: "Choose a ready-made shape, custom polygon, or freeform filled shape to add to the canvas.",
  },
  "finger-drawing": {
    title: "Draw with finger",
    body: "Allow your finger as well as Apple Pencil to draw.",
  },
  "finger-erasing": {
    title: "Erase with finger",
    body: "Allow your finger as well as Apple Pencil to erase. This is separate from Draw with finger and stays off until you turn it on.",
  },
  "pen-preview": {
    title: "Pen preview",
    body: "See how the selected nib, colour, thickness, and opacity will look.",
  },
  "pen-nib": {
    title: "Pen nib",
    body: "Choose the type of mark your pen makes.",
  },
  "pen-colour": {
    title: "Pen colour",
    body: "Choose a drawing colour from the custom selector or your favourites.",
  },
  "pen-thickness": {
    title: "Pen thickness",
    body: "Make the pen stroke thinner or thicker.",
  },
  "pen-opacity": {
    title: "Pen opacity",
    body: "Make the pen stroke lighter or more solid.",
  },
  "drawing-grid": {
    title: "Drawing grid",
    body: "Turn the drawing guide on or off for this page.",
  },
  "grid-size": {
    title: "Grid size",
    body: "Choose how far apart the grid lines or dots are.",
  },
  "grid-type": {
    title: "Grid type",
    body: "Show the guide as lines or dots.",
  },
  "grid-colour": {
    title: "Grid colour",
    body: "Choose a colour for the drawing guide.",
  },
  "grid-rotation": {
    title: "Grid rotation",
    body: "Turn the guide around the centre of the page.",
  },
  "arrange-object": {
    title: "Page item",
    body: "This item can be moved, resized, layered, or removed while Edit is selected.",
  },
  "canvas-text-structure": {
    title: "Text structure",
    body: "Mark this block as a title, heading, or main text so the page has a clear reading structure.",
  },
  "canvas-text-style": {
    title: "Text style",
    body: "Choose a clear bundled font and text colour. You can also add or remove a coloured background and outline.",
  },
  "canvas-text-order": {
    title: "Reading order",
    body: "Move a stacked text block earlier or later. This order is also used in readable exports.",
  },
  "canvas-text-membership": {
    title: "Structured or free text",
    body: "Move text to the canvas for free placement, or return it to the page’s ordered text column.",
  },
  "arrange-move": {
    title: "Move item",
    body: "Drag this handle to move the item around the page.",
  },
  "arrange-resize": {
    title: "Resize item",
    body: "Drag this handle to make the item larger or smaller.",
  },
  "arrange-delete": {
    title: "Delete item",
    body: "Remove this item from the page.",
  },
  "arrange-layer": {
    title: "Place above or below",
    body: "Choose whether this item appears in front of or behind the drawing.",
  },
  "arrange-proportion": {
    title: "Keep photo shape",
    body: "Keep the photo’s proportions while you resize it.",
  },
  "arrange-shape-appearance": {
    title: "Shape fill and outline",
    body: "Open the palette to add, remove, or change this shape’s fill, outline colour, and outline thickness.",
  },
  "shape-edit": { title: "Edit shape", body: "Drag the shape or use arrow keys to move it. Use the palette to rotate, resize, reshape, sort, copy, delete, or change its style." },
  "shape-palette-move": { title: "Move shape palette", body: "Drag this handle to place the shape controls where you want them. You can also use the arrow keys; hold Shift for a larger step." },
  "shape-adjust": { title: "Adjust shape", body: "Choose Move, Rotate, Scale, or Sort. The controls on the right change to match your choice." },
  "shape-snap": { title: "Shape snapping", body: "Turn snapping on to align a moved shape or vertex with a nearby node on another shape." },
  "shape-freeform": { title: "Freeform shape", body: "Draw one continuous outline and release to fill it. The app smooths the outline into a small set of editable points." },
  "shape-move": { title: "Move shape", body: "Drag the selected shape on the canvas, use arrow keys, or use these direction buttons." },
  "shape-rotate": { title: "Rotate shape", body: "Use the palette’s left and right buttons to rotate the shape in small steps." },
  "shape-scale": { title: "Scale shape", body: "Use the palette’s Larger and Smaller buttons to resize the shape evenly around its centre." },
  "shape-sort": { title: "Sort shape", body: "Move the shape one step forward or backward in the canvas stack." },
  "shape-colour": { title: "Shape style", body: "Open Style to change or remove the fill and outline, and adjust outline thickness." },
  "shape-add-vertex": { title: "Add a vertex", body: "Tap plus, then tap a plus marker on the edge where you want a new corner. Circles cannot have vertices." },
  "shape-delete-vertex": { title: "Delete a vertex", body: "Select a vertex, then tap minus. A shape must keep at least three vertices." },
  "shape-vertex": { title: "Move a vertex", body: "Drag this vertex to reshape the object, or select it before using the minus button." },
  "shape-edge": { title: "Choose an edge", body: "Tap this edge marker to add a new vertex here." },
  "shape-layer-up": { title: "Move shape up", body: "Move the shape one step towards the top of the canvas stack." },
  "shape-layer-down": { title: "Move shape down", body: "Move the shape one step towards the grid in the canvas stack." },
  "shape-duplicate": { title: "Make a copy", body: "Make an offset copy and select the new shape immediately." },
  "shape-delete": { title: "Delete shape", body: "Remove this shape after a confirmation warning." },
  "arrange-edit-link": {
    title: "Edit link",
    body: "Change this link’s web address or name.",
  },
  "library-arrange": {
    title: "Edit",
    body: "Reorder or remove items in this collection.",
  },
  "new-sketchbook": {
    title: "New sketchbook",
    body: "Create a new sketchbook and give it a name.",
  },
  "open-sketchbook": {
    title: "Open sketchbook",
    body: "Open this sketchbook and continue working in it.",
  },
  "open-favourite": {
    title: "Open favourite",
    body: "Open this saved page or sketchbook.",
  },
  "back-sketchbooks": {
    title: "All sketchbooks",
    body: "Return to your list of sketchbooks.",
  },
  "settings-about": {
    title: "How to use About Me",
    body: "Tap the name box to type the name used in your welcome greeting, or tap Speak and say it aloud. Tap Edit portrait to draw your picture. Your changes save on this iPad and are included in iCloud backups.",
  },
  "settings-welcome": {
    title: "How to use Welcome",
    body: "Type the greeting, heading, and message you want to see when the App opens. Leave a heading blank to use the standard wording. Tap Preview welcome to check the complete page before returning to Settings.",
  },
  "settings-canvas": {
    title: "How to use Canvas",
    body: "Choose whether your finger can draw, then select and adjust favourite pen colours. Use the test canvas to try nibs, thickness, and opacity without changing a journal page. Clear removes only the test drawing.",
  },
  "settings-voice": {
    title: "How to use Voice",
    body: "Choose which text editor to use and set how long a voice recording may run before stopping safely. Add names or unusual phrases under My Words to help Apple Speech recognise them. Voice features ask for microphone and speech permission when needed.",
  },
  "settings-appearance": {
    title: "How to use Appearance",
    body: "Choose a text size, then turn stronger contrast or reduced movement on if that makes the App easier to use. Standard app appearance keeps the intended iPad layout. Changes take effect immediately and can be changed back here.",
  },
  "settings-backup": {
    title: "How to use Backup",
    body: "Open iCloud Sync to save or check the latest complete diary. Open History to create, restore, or delete dated recovery points. Open Privacy & Export to export a portable copy or permanently delete iCloud data after two warnings. Tap a heading again to close it.",
  },
  "welcome-continue": {
    title: "Open App",
    body: "Continue from the welcome screen into the App.",
  },
  "return-settings": {
    title: "Return to Settings",
    body: "Leave this preview and go back to Settings.",
  },
  "portrait-return": {
    title: "Finish portrait",
    body: "Save your drawing choices and return to Settings.",
  },
  "drawing-toolbar": {
    title: "Drawing tool",
    body: "Choose a drawing action for this canvas.",
  },
} satisfies Record<string, HelpTip>;

export type HelpTopic = keyof typeof HELP_TIPS;

export function isHelpTopic(value: string): value is HelpTopic {
  return Object.hasOwn(HELP_TIPS, value);
}
