# fuzzysearch v1.3

Adds a fuzzy search input (FUZZYSEARCH) using Fuse.js for typo-tolerant page searching and Obsidian-style link adding method \[\[work]] to initiate fuzzy search and allow easy link creation in dokuwiki.

Improvements:

* Admin config to restrict searches/links to ACL-permitted pages or allow all.
* Configurable Fuse.js options: threshold (fuzziness) and limit (max results).
* Editor preserves cursor focus after link insertion.
* Fixed caret coordinates calculation for accurate dropdown positioning, with scroll handling for a clean, modern UX.
* Preserved textarea scroll position after link insertion to prevent unwanted scrolling.
