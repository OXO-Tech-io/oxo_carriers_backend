// Hard cap on decoded image size. The agent's JPEGs are ~200 KB; this only stops abuse.
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;
