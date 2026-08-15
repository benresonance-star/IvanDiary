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
  "nav-diary": {
    title: "My Journal",
    body: "Open your dated journal pages.",
  },
  "nav-sketchbooks": {
    title: "My Sketchbooks",
    body: "Open your free-form sketchbooks.",
  },
  "nav-favourites": {
    title: "My Favourites",
    body: "See pages and sketchbooks you have marked with a thumbs-up.",
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
    title: "Arrange",
    body: "Move, resize, edit, or remove items on this page. To explore those controls, enter Arrange first, then turn Help on.",
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
    body: "Reverse your most recent drawing or arranging change.",
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
    body: "Open this page. In Arrange mode, page controls can also reorder or remove it.",
  },
  "add-page": {
    title: "Add a page",
    body: "Create another page for this date or sketchbook.",
  },
  "pen-tab": {
    title: "Pen settings",
    body: "Choose how your pen looks and whether you can draw with a finger.",
  },
  "grid-tab": {
    title: "Grid settings",
    body: "Show and adjust a guide for straight drawing.",
  },
  "finger-drawing": {
    title: "Draw with finger",
    body: "Allow your finger as well as Apple Pencil to draw.",
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
    body: "This item can be moved, resized, layered, or removed while Arrange is selected.",
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
  "arrange-edit-link": {
    title: "Edit link",
    body: "Change this link’s web address or name.",
  },
  "library-arrange": {
    title: "Arrange",
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
    title: "About Me settings",
    body: "Change your name or draw your profile picture.",
  },
  "settings-welcome": {
    title: "Welcome settings",
    body: "Change the greeting shown when the App opens and preview it.",
  },
  "settings-canvas": {
    title: "Canvas settings",
    body: "Choose drawing colours, pen behavior, and test your drawing tools.",
  },
  "settings-voice": {
    title: "Voice settings",
    body: "Choose recording limits and help the App recognise important words.",
  },
  "settings-appearance": {
    title: "Appearance settings",
    body: "Adjust text size, contrast, and movement to suit you.",
  },
  "settings-backup": {
    title: "Backup settings",
    body: "Check, create, or restore your iCloud backup.",
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
