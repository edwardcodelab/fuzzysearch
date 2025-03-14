document.addEventListener('DOMContentLoaded', function () {
    // Function to initialize fuzzy search for a given input or textarea element
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

        // Fetch pages and initialize Fuse.js
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
                threshold: 0.4,
                includeScore: true,
                maxPatternLength: 32,
                minMatchCharLength: 2
            });
        })
        .catch(error => console.error('Initial fetch error:', error));

        // Function to handle search logic
        function handleInputChange() {
            if (searchTimeout) clearTimeout(searchTimeout);

            searchTimeout = setTimeout(() => {
                const cursorPos = element.selectionStart || element.value.length;
                const text = element.value;
                const match = text.substring(0, cursorPos).match(/\[\[([^\[\]]+)\]\]$/);
                if (!match) {
                    if (resultsDiv) {
                        resultsDiv.remove();
                        resultsDiv = null;
                    }
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

                const results = fuse.search(phrase, { limit: 10 });
                displayResults(results, phrase, cursorPos);
            }, 300); // Debounce delay
        }

        // Add event listeners
        element.addEventListener('keyup', function (e) {
            if (e.key === ']') {
                handleInputChange();
            }
        });

        element.addEventListener('input', handleInputChange);

        element.addEventListener('compositionend', handleInputChange);

        // Display results function
        function displayResults(results, phrase, cursorPos) {
            if (resultsDiv) {
                resultsDiv.remove();
            }
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
            const text = element.value;
            const newLink = `[[${pageId}|${phrase}]]`;
            const start = text.lastIndexOf(`[[${phrase}]]`);
            element.value = text.substring(0, start) + newLink + text.substring(start + phrase.length + 4);
            if (resultsDiv) {
                resultsDiv.remove();
                resultsDiv = null;
            }
            lastPhrase = '';
            element.focus();
        }

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
            } else if (e.key === 'Space' || e.key === 'Enter') {
                e.preventDefault();
                if (currentIndex >= 0) {
                    const selected = resultsDiv.children[currentIndex];
                    selectResult(selected.dataset.id, lastPhrase);
                }
            } else if (e.key === 'Escape') {
                if (resultsDiv) {
                    resultsDiv.remove();
                    resultsDiv = null;
                    lastPhrase = '';
                }
            }
        });

        document.addEventListener('click', function (e) {
            if (resultsDiv && !resultsDiv.contains(e.target) && e.target !== element) {
                resultsDiv.remove();
                resultsDiv = null;
                lastPhrase = '';
            }
        });

        function getCaretCoordinates(element, position) {
            const isTextarea = element.tagName.toLowerCase() === 'textarea';
            const text = element.value.substring(0, position);
            const font = window.getComputedStyle(element).font;
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = font;

            if (isTextarea) {
                const lines = text.split('\n');
                const lastLine = lines[lines.length - 1];
                const width = context.measureText(lastLine).width;
                const lineHeight = parseInt(font);
                const top = (lines.length - 1) * lineHeight;
                return { top: top, left: width };
            } else {
                // For input type="text", no line breaks, just measure the text width
                const width = context.measureText(text).width;
                const lineHeight = parseInt(font);
                return { top: 0, left: width };
            }
        }
    }

    // Target the main wiki editor textarea
    const wikiTextarea = document.querySelector('textarea[name="wikitext"]');
    if (wikiTextarea) {
        initializeFuzzySearch(wikiTextarea);
    }

    // Target Bureaucracy form textareas and textboxes
    const bureaucracyElements = document.querySelectorAll('.bureaucracy__plugin textarea, .bureaucracy__plugin input[type="text"]');
    bureaucracyElements.forEach(element => {
        initializeFuzzySearch(element);
    });

    // Use MutationObserver to catch dynamically added Bureaucracy form elements
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            const newElements = mutation.target.querySelectorAll('.bureaucracy__plugin textarea, .bureaucracy__plugin input[type="text"]');
            newElements.forEach(element => {
                if (!element.dataset.fuzzyInitialized) {
                    initializeFuzzySearch(element);
                    element.dataset.fuzzyInitialized = 'true'; // Mark as initialized
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});