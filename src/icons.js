const BaseIcon = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  path: "",
};

const icons = {
  strong: {
    ...BaseIcon,
    path: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8",
  },
  em: {
    ...BaseIcon,
    path: "M19 4L10 4 M14 20L5 20 M15 4L9 20",
  },
  superScript: {
    ...BaseIcon,
    path: "M4 19l8-8 M12 19l-8-8 M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06",
  },
  code: {
    ...BaseIcon,
    path: "M16 18l6-6-6-6 M8 6l-6 6 6 6",
  },
  strike: {
    ...BaseIcon,
    path: "M16 4H9a3 3 0 0 0-2.83 4 M14 12a4 4 0 0 1 0 8H6 M4 12h16",
  },
  link: {
    ...BaseIcon,
    path: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  },
  undo: {
    ...BaseIcon,
    path: "M3 7v6h6 M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13",
  },
  redo: {
    ...BaseIcon,
    path: "M21 7v6h-6 M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7",
  },
  bulletList: {
    ...BaseIcon,
    path: "M8 6h13 M8 12h13 M8 18h13 M4 6a1 1 0 1 1-2 0 1 1 0 0 1 2 0 M4 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0 M4 18a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
  },
  orderedList: {
    ...BaseIcon,
    path: "M11 5h10 M11 12h10 M11 19h10 M4 4h1v5 M4 9h2 M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02",
  },
  h1: {
    ...BaseIcon,
    path: "M4 12h8 M4 18V6 M12 18V6 M17 12l3-2v8",
  },
  h2: {
    ...BaseIcon,
    path: "M4 12h8 M4 18V6 M12 18V6 M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1",
  },
  h3: {
    ...BaseIcon,
    path: "M4 12h8 M4 18V6 M12 18V6 M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2 M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2",
  },
  image: {
    ...BaseIcon,
    path: "M10.3 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10l-3.1-3.1a2 2 0 0 0-2.814.014L6 21 M14 19.5l3-3 3 3 M17 22v-5.5 M9 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  },
  sparkles: {
    ...BaseIcon,
    path: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z M20 2v4 M22 4h-4 M4 20m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  },
};

export default icons;
