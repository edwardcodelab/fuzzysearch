document.addEventListener('DOMContentLoaded', function () {
    ////console.log('FuzzySearch original script loaded');

    const input = document.getElementById('fuzzysearch-input');
    const resultsList = document.getElementById('fuzzysearch-results');

    if (!input || !resultsList) {
        console.error('Fuzzy search elements not found!');
        return;
    }

    let fuse, currentIndex = -1;

    fetch(DOKU_BASE + 'lib/exe/ajax.php?call=fuzzysearch_pages', {
        method: 'GET',
        credentials: 'same-origin'
    })
    .then(response => {
        if (!response.ok) throw new Error('Fetch failed');
        return response.json();
    })
    .then(data => {
        fuse = new Fuse(data, {
            keys: ['title'],
            threshold: 0.4,
            includeScore: true
        });

        input.addEventListener('input', function () {
            const query = this.value.trim();
            resultsList.innerHTML = '';
            currentIndex = -1;

            if (query.length === 0) return;

            const results = fuse.search(query);
            results.forEach((result, index) => {
                const page = result.item;
                const li = document.createElement('li');
                li.innerHTML = `<a href="${DOKU_BASE}doku.php?id=${page.id}">${page.title}</a>`;
                li.dataset.index = index;
                resultsList.appendChild(li);
            });
            if (results.length === 0) {
                resultsList.innerHTML = '<li>No matches found</li>';
            }
        });

        input.addEventListener('keydown', function (e) {
            const items = resultsList.getElementsByTagName('li');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentIndex < items.length - 1) {
                    currentIndex++;
                    updateHighlight(items);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentIndex > 0) {
                    currentIndex--;
                    updateHighlight(items);
                } else {
                    currentIndex = -1;
                    updateHighlight(items);
                }
            } else if (e.key === 'Enter' && currentIndex >= 0) {
                e.preventDefault();
                const selectedLink = items[currentIndex].querySelector('a');
                if (selectedLink) window.location.href = selectedLink.href;
            }
        });

        function updateHighlight(items) {
            for (let i = 0; i < items.length; i++) {
                items[i].classList.remove('highlighted');
                if (i === currentIndex) {
                    items[i].classList.add('highlighted');
                    items[i].scrollIntoView({ block: 'nearest' });
                }
            }
        }
    })
    .catch(error => {
       // console.error('Error fetching page data:', error);
        resultsList.innerHTML = '<li>Error loading search data</li>';
    });
});