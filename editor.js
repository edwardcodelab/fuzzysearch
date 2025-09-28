document.addEventListener('DOMContentLoaded', function () {
    // Utility function to get relative caret coordinates in a textarea
    // Uses a mirror div technique for accurate positioning, accounting for styles, wrapping, and scroll
    // Returns {top, left} relative to the content box (after padding)
    function getCaretCoordinates(element, position) {
        try {
            const style = getComputedStyle(element);
            const div = document.createElement('div');

            // Set essential styles for accurate mirroring (font, padding, etc.) for a clean, modern feel
            div.style.position = 'absolute'; // Offscreen positioning
            div.style.visibility = 'hidden'; // No visual flash
            div.style.left = '-9999px';
            div.style.top = '0';
            div.style.width = element.clientWidth + 'px'; // Match width for wrapping
            div.style.height = element.clientHeight + 'px'; // Not strictly needed but for consistency
            div.style.padding = style.padding;
            div.style.font = style.font;
            div.style.fontSize = style.fontSize;
            div.style.fontFamily = style.fontFamily;
            div.style.lineHeight = style.lineHeight;
            div.style.letterSpacing = style.letterSpacing;
            div.style.wordSpacing = style.wordSpacing;
            div.style.whiteSpace = 'pre-wrap'; // Handle newlines and wrapping
            div.style.wordWrap = 'break-word';
            div.style.overflowWrap = 'break-word';
            div.style.textTransform = style.textTransform;
            div.style.boxSizing = style.boxSizing;
            div.style.border = style.border; // Include border for precise bounding

            // Set content up to caret position
            div.textContent = element.value.substring(0, position);

            // Marker span at caret position (empty for precise location)
            const span = document.createElement('span');
            // span.textContent = '\u200b'; // Zero-width space if needed for dimension, but empty works
            div.appendChild(span);

            // Append to body, measure, remove
            document.body.appendChild(div);
            const coords = {
                top: span.offsetTop + parseInt(style.paddingTop) - element.scrollTop,
                left: span.offsetLeft + parseInt(style.paddingLeft) - element.scrollLeft
            };
            div.remove();

            return coords;
        } catch (e) {
            console.error('getCaretCoordinates error:', e);
            return { top: 0, left: 0 }; // Fallback to avoid breaking UX
        }
    }

    // Function to initialize fuzzy search for a given input or textarea element
    // Breaks init into a reusable function for clarity and potential multiple editors
    function initializeFuzzySearch(element) {
        if (!element) {
            console.error('Element not found!');
            return;
        }

        let resultsDiv = null;
        let currentIndex = -1;
        let lastPhrase = '';
        let fuse = null;
        let pagesCache = null;
        let searchTimeout = null;

        // Fetch pages and initialize Fuse.js with config from global var
        // Error handling for fetch failures
        fetch(DOKU_BASE + 'lib/exe/ajax.php?call=fuzzysearch_pages', {
            method: 'GET',
            credentials: 'same-origin'
        })
        .then(response => {
            if (!response.ok) throw new Error('Failed to fetch pages');
            return response.json();
        })
        .then(pages => {
            pagesCache = pages;
            fuse = new Fuse(pagesCache, {
                keys: ['title'],
                threshold: FUZZYSEARCH_CONFIG.threshold, // Use admin-configured fuzziness
                includeScore: true,
                maxPatternLength: 32,
                minMatchCharLength: 2
            });
        })
        .catch(error => console.error('Initial fetch error:', error));

        // Function to handle search logic with debounce for performance
        function handleInputChange() {
            if (searchTimeout) clearTimeout(searchTimeout);

            searchTimeout = setTimeout(() => {
                const cursorPos = element.selectionStart || element.value.length;
                const text = element.value;
                const match = text.substring(0, cursorPos).match(/\[\[([^\[\]]+)\]\]$/);
                if (!match) {
                    hideResults();
                    return;
                }

                const phrase = match[1].trim();
                if (!phrase || phrase === lastPhrase) {
                    return;
                }
                lastPhrase = phrase;

                if (!fuse) {
                    console.error('Fuse not initialized yet');
                    return;
                }

                const results = fuse.search(phrase, { limit: FUZZYSEARCH_CONFIG.limit }); // Use admin-configured limit
                displayResults(results, phrase, cursorPos);
            }, 300); // Debounce delay for smooth UX
        }

        // Helper to hide results div safely
        function hideResults() {
            if (resultsDiv) {
                resultsDiv.remove();
                resultsDiv = null;
            }
        }

        // Add event listeners with basic error handling
        try {
            element.addEventListener('keyup', function (e) {
                if (e.key === ']') {
                    handleInputChange();
                }
            });

            element.addEventListener('input', handleInputChange);
            element.addEventListener('compositionend', handleInputChange);
        } catch (e) {
            console.error('Event listener error:', e);
        }

        // Display results function - positions dropdown aesthetically near cursor
        function displayResults(results, phrase, cursorPos) {
            hideResults();
            if (results.length === 0) {
                return;
            }

            resultsDiv = document.createElement('div');
            resultsDiv.id = 'fuzzysearch-editor-results';
            resultsDiv.style.position = 'absolute';
            resultsDiv.style.background = 'white';
            resultsDiv.style.border = '1px solid #ccc';
            resultsDiv.style.padding = '5px';
            resultsDiv.style.zIndex = '1000';
            resultsDiv.style.maxHeight = '200px';
            resultsDiv.style.overflowY = 'auto';

            const elementRect = element.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            const coords = getCaretCoordinates(element, cursorPos);

            const cursorTop = elementRect.top + scrollTop + coords.top;
            const cursorLeft = elementRect.left + scrollLeft + coords.left;

            resultsDiv.style.left = cursorLeft + 'px';
            let desiredTop = cursorTop;

            results.forEach((result, index) => {
                const page = result.item;
                const div = document.createElement('div');
                div.textContent = page.title;
                div.dataset.index = index;
                div.dataset.id = page.id;
                div.style.cursor = 'pointer';
                div.style.padding = '2px 5px';
                div.addEventListener('mouseover', () => highlightResult(index));
                div.addEventListener('click', () => selectResult(page.id, phrase));
                resultsDiv.appendChild(div);
            });

            document.body.appendChild(resultsDiv);
            const dropdownHeight = resultsDiv.offsetHeight;
            const elementBottom = elementRect.bottom + scrollTop;

            if (desiredTop + dropdownHeight > elementBottom) {
                desiredTop = elementBottom - dropdownHeight;
            }

            const viewportHeight = window.innerHeight;
            const maxTop = scrollTop + viewportHeight - dropdownHeight;
            if (desiredTop > maxTop) {
                desiredTop = maxTop;
            }

            const elementTop = elementRect.top + scrollTop;
            if (desiredTop < elementTop) {
                desiredTop = elementTop;
            }

            resultsDiv.style.top = desiredTop + 'px';

            currentIndex = 0;
            highlightResult(currentIndex);
        }

        function highlightResult(index) {
            if (!resultsDiv) return;
            const items = resultsDiv.children;
            for (let i = 0; i < items.length; i++) {
                items[i].style.background = i === index ? '#ddd' : 'white';
            }
            currentIndex = index;
            if (items[index]) {
                items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        function selectResult(pageId, phrase) {
            // Preserve scroll position to prevent unwanted scrolling after insertion
            const scrollTop = element.scrollTop;

            const text = element.value;
            const newLink = `[[${pageId}|${phrase}]]`;
            const start = text.lastIndexOf(`[[${phrase}]]`);
            const end = start + phrase.length + 4; // Length of [[phrase]]
            element.value = text.substring(0, start) + newLink + text.substring(end);
            
            // Preserve focus and set cursor right after the new link for seamless editing
            const newCursorPos = start + newLink.length;
            element.setSelectionRange(newCursorPos, newCursorPos);
            element.scrollTop = scrollTop; // Restore scroll position for consistent UX
            element.focus();

            hideResults();
            lastPhrase = '';
        }

        // Keydown handler for navigation
        element.addEventListener('keydown', function (e) {
            if (!resultsDiv || resultsDiv.children.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentIndex < resultsDiv.children.length - 1) {
                    currentIndex++;
                    highlightResult(currentIndex);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex > 0) {
                    currentIndex--;
                    highlightResult(currentIndex);
                }
            } else if (e.key === 'Enter' && currentIndex >= 0) {
                e.preventDefault();
                const selected = resultsDiv.children[currentIndex];
                if (selected) {
                    selectResult(selected.dataset.id, lastPhrase);
                }
            } else if (e.key === 'Escape') {
                hideResults();
            }
        });
    }

    // Initialize on the default DokuWiki editor textarea
    const editor = document.querySelector('textarea#wiki__text');
    if (editor) {
        initializeFuzzySearch(editor);
    }
});