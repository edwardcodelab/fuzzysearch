document.addEventListener('DOMContentLoaded', function () {
    //console.log('FuzzySearch editor enhancement loaded');

    const textarea = document.querySelector('textarea[name="wikitext"]');
    if (!textarea) {
        console.error('Editor textarea not found!');
        return;
    }
    //console.log('Textarea found:', textarea);

    let resultsDiv = null;
    let currentIndex = -1;
    let lastPhrase = '';
    let fuse = null;
    let pagesCache = null;
    let searchTimeout = null;

    fetch(DOKU_BASE + 'lib/exe/ajax.php?call=fuzzysearch_pages', {
        method: 'GET',
        credentials: 'same-origin'
    })
    .then(response => {
        //console.log('Initial fetch status:', response.status);
        if (!response.ok) throw new Error('Failed to fetch pages');
        return response.json();
    })
    .then(pages => {
        pagesCache = pages;
        //console.log('Pages cached:', pagesCache.length);
        fuse = new Fuse(pagesCache, {
            keys: ['title'],
            threshold: 0.4,
            includeScore: true,
            maxPatternLength: 32,
            minMatchCharLength: 2
        });
        //console.log('Fuse initialized');
    })
    .catch(error => console.error('Initial fetch error:', error));

    textarea.addEventListener('keyup', function (e) {
        //console.log('Keyup detected:', e.key);
        if (e.key !== ']') return;

        if (searchTimeout) clearTimeout(searchTimeout);

        searchTimeout = setTimeout(() => {
            const cursorPos = textarea.selectionStart;
            const text = textarea.value;
            const match = text.substring(0, cursorPos).match(/\[\[([^\[\]]+)\]\]$/);
            if (!match) {
                //console.log('No [[phrase]] pattern found');
                return;
            }

            const phrase = match[1].trim();
            if (!phrase || phrase === lastPhrase) {
                //console.log('Phrase empty or unchanged:', phrase);
                return;
            }
            lastPhrase = phrase;

            if (!fuse) {
                console.error('Fuse not initialized yet');
                return;
            }

            //console.log('Searching for phrase:', phrase);
            const results = fuse.search(phrase, { limit: 10 });
            //console.log('Search results:', results);
            displayResults(results, phrase, cursorPos);
        }, 300);
    });

    function displayResults(results, phrase, cursorPos) {
        if (resultsDiv) {
            resultsDiv.remove();
        }
        if (results.length === 0) {
            //console.log('No results for:', phrase);
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

        // Get textarea dimensions and position
        const textareaRect = textarea.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const coords = getCaretCoordinates(textarea, cursorPos);

        // Position the dropdown at the cursor's horizontal level
        const cursorTop = textareaRect.top + scrollTop + coords.top;
        const cursorLeft = textareaRect.left + scrollLeft + coords.left;

        // Set initial position
        resultsDiv.style.left = cursorLeft + 'px';
        let desiredTop = cursorTop; // Align with the cursor line

        // Populate the dropdown
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

        // Append temporarily to measure height
        document.body.appendChild(resultsDiv);
        const dropdownHeight = resultsDiv.offsetHeight;
        const textareaBottom = textareaRect.bottom + scrollTop;

        // Adjust top position to prevent going below textarea bottom
        if (desiredTop + dropdownHeight > textareaBottom) {
            desiredTop = textareaBottom - dropdownHeight;
        }

        // Ensure it doesn't go below the viewport bottom
        const viewportHeight = window.innerHeight;
        const maxTop = scrollTop + viewportHeight - dropdownHeight;
        if (desiredTop > maxTop) {
            desiredTop = maxTop;
        }

        // Ensure it doesn't go above the textarea top
        const textareaTop = textareaRect.top + scrollTop;
        if (desiredTop < textareaTop) {
            desiredTop = textareaTop;
        }

        resultsDiv.style.top = desiredTop + 'px';

        // Set the first item as selected by default
        currentIndex = 0;
        highlightResult(currentIndex); // Highlight the first result

        //console.log('Results displayed at:', resultsDiv.style.top, resultsDiv.style.left);
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
        const text = textarea.value;
        const newLink = `[[${pageId}|${phrase}]]`;
        const start = text.lastIndexOf(`[[${phrase}]]`);
        textarea.value = text.substring(0, start) + newLink + text.substring(start + phrase.length + 4);
        if (resultsDiv) {
            resultsDiv.remove();
            resultsDiv = null;
        }
        lastPhrase = '';
        textarea.focus();
    }

    textarea.addEventListener('keydown', function (e) {
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
            //console.log('Space or Enter pressed, currentIndex:', currentIndex); // Debug log
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
        if (resultsDiv && !resultsDiv.contains(e.target) && e.target !== textarea) {
            resultsDiv.remove();
            resultsDiv = null;
            lastPhrase = '';
        }
    });

    function getCaretCoordinates(element, position) {
        const text = element.value.substring(0, position);
        const lines = text.split('\n');
        const lastLine = lines[lines.length - 1];
        const font = window.getComputedStyle(element).font;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = font;
        const width = context.measureText(lastLine).width;
        const lineHeight = parseInt(font);
        const top = (lines.length - 1) * lineHeight;
        return { top: top, left: width };
    }
});