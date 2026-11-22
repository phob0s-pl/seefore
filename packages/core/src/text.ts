/**
 * Limits on the text a source directory holds. They sit here, apart from the marker and the
 * records, because both use them and neither may depend on the other.
 */

/** The most characters a name may have: the architecture's, in the marker, and a record's. */
export const NAME_MAX = 100;

/** The most characters a record's description may have. */
export const DESCRIPTION_MAX = 2000;
