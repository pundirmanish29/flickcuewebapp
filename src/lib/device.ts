/** A phone or tablet, where the Chrome extension can't be installed. */
export const onPhone = () => typeof navigator !== "undefined" && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
