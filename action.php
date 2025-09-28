<?php
if (!defined('DOKU_INC')) die();

class action_plugin_fuzzysearch extends DokuWiki_Action_Plugin {
    private function getCacheFile() {
        if ($this->getConf('restrict_to_acl')) {
            $user = $this->getCurrentUser();
            if (!$user) return null;
            $userHash = md5($user);
            return DOKU_INC . 'data/cache/fuzzysearch_pages_' . $userHash . '.json';
        } else {
            return DOKU_INC . 'data/cache/fuzzysearch_pages_global.json';
        }
    }

    private function getCacheMetaFile() {
        if ($this->getConf('restrict_to_acl')) {
            $user = $this->getCurrentUser();
            if (!$user) return null;
            $userHash = md5($user);
            return DOKU_INC . 'data/cache/fuzzysearch_pages_' . $userHash . '.meta.json';
        } else {
            return DOKU_INC . 'data/cache/fuzzysearch_pages_global.meta.json';
        }
    }

    public function register(Doku_Event_Handler $controller) {
        $controller->register_hook('AJAX_CALL_UNKNOWN', 'BEFORE', $this, 'handle_ajax_call');
        $controller->register_hook('INDEXER_VERSION_GET', 'BEFORE', $this, 'update_cache_on_change');
        $controller->register_hook('TPL_METAHEADER_OUTPUT', 'BEFORE', $this, 'load_scripts');
    }

    public function handle_ajax_call(Doku_Event &$event, $param) {
        if ($event->data === 'fuzzysearch_pages') {
            $event->preventDefault();
            $event->stopPropagation();

            if (!$this->isLoggedIn()) {
                $this->redirectToLogin();
                exit;
            }

            $cacheFile = $this->getCacheFile();
            $this->ensureCacheExists();

            if (file_exists($cacheFile)) {
                header('Content-Type: application/json');
                readfile($cacheFile);
            } else {
                header('HTTP/1.1 500 Internal Server Error');
                echo json_encode(['error' => 'Cache generation failed']);
            }
            exit;
        }
    }

    public function update_cache_on_change(Doku_Event &$event, $param) {
        if (!$this->getConf('restrict_to_acl') || $this->isLoggedIn()) {
            $this->ensureCacheExists(true);
        }
    }

    public function load_scripts(Doku_Event &$event, $param) {
        // Log for debugging purposes
        error_log('FuzzySearch: Loading scripts');

        // Inline config for JS to access plugin settings dynamically
        $threshold = $this->getConf('fuse_threshold');
        $limit = $this->getConf('fuse_limit');
        $inlineScript = "var FUZZYSEARCH_CONFIG = { threshold: $threshold, limit: $limit };";
        $event->data['script'][] = [
            'type' => 'text/javascript',
            '_data' => $inlineScript
        ];

        // Load Fuse.js (local for reliability)
        $fuseSrc = DOKU_BASE . 'lib/plugins/fuzzysearch/fuse.min.js';
        if (!in_array($fuseSrc, array_column($event->data['script'], 'src'))) {
            $event->data['script'][] = [
                'type' => 'text/javascript',
                'src' => $fuseSrc,
                '_data' => '',
                'defer' => 'defer'
            ];
            error_log('FuzzySearch: Fuse.js added');
        }

        // Load search bar script
        $scriptSrc = DOKU_BASE . 'lib/plugins/fuzzysearch/script.js';
        if (!in_array($scriptSrc, array_column($event->data['script'], 'src'))) {
            $event->data['script'][] = [
                'type' => 'text/javascript',
                'src' => $scriptSrc,
                '_data' => '',
                'defer' => 'defer'
            ];
            error_log('FuzzySearch: script.js added');
        }

        // Load editor enhancement script
        $editorSrc = DOKU_BASE . 'lib/plugins/fuzzysearch/editor.js';
        if (!in_array($editorSrc, array_column($event->data['script'], 'src'))) {
            $event->data['script'][] = [
                'type' => 'text/javascript',
                'src' => $editorSrc,
                '_data' => '',
                'defer' => 'defer'
            ];
            error_log('FuzzySearch: editor.js added');
        }
    }

    private function ensureCacheExists($forceUpdate = false) {
        $cacheFile = $this->getCacheFile();
        $cacheMetaFile = $this->getCacheMetaFile();
        if (!$cacheFile || !$cacheMetaFile) return;

        $meta = $this->loadCacheMeta($cacheMetaFile);
        $lastModified = $this->getLastPageModificationTime();

        if (!$forceUpdate && file_exists($cacheFile) && isset($meta['last_updated']) && $meta['last_updated'] >= $lastModified) {
            return;
        }

        try {
            $pages = $this->generatePageList();
            $jsonData = json_encode($pages);
            $metaData = ['last_updated' => time()];

            if (!is_dir(dirname($cacheFile))) {
                mkdir(dirname($cacheFile), 0755, true);
            }

            file_put_contents($cacheFile, $jsonData);
            file_put_contents($cacheMetaFile, json_encode($metaData));
        } catch (Exception $e) {
            error_log('FuzzySearch: Cache generation error - ' . $e->getMessage());
        }
    }

    private function generatePageList() {
        if ($this->getConf('restrict_to_acl') && !$this->isLoggedIn()) {
            $this->redirectToLogin();
            exit;
        }

        $dir = DOKU_INC . 'data/pages/';
        $page_list = $this->getPageList($dir);
        $pages = [];
        $restrict = $this->getConf('restrict_to_acl');
        foreach ($page_list as $file) {
            $id = pathID($file);
            if (!$restrict || auth_quickaclcheck($id) >= AUTH_READ) {
                $title = p_get_first_heading($id) ?: noNS($id);
                $pages[] = ['id' => $id, 'title' => $title];
            }
        }
        return $pages;
    }

    private function getPageList($dir, $base = '') {
        $files = [];
        $items = dir($dir);
        while (false !== ($entry = $items->read())) {
            if ($entry === '.' || $entry === '..') continue;
            $path = $dir . $entry;
            if (is_dir($path)) {
                // Check ACL for namespace if restricted (for efficiency)
                $ns = $base . $entry . ':';
                if (!$this->getConf('restrict_to_acl') || auth_quickaclcheck($ns) >= AUTH_READ) {
                    $files = array_merge($files, $this->getPageList($path . '/', $ns));
                }
            } elseif (preg_match('/\.txt$/', $entry)) {
                $files[] = $base . substr($entry, 0, -4);
            }
        }
        $items->close();
        return $files;
    }

    private function getLastPageModificationTime() {
        $dir = DOKU_INC . 'data/pages/';
        $latest = 0;
        $this->scanDirForLatest($dir, $latest);
        return $latest;
    }

    private function scanDirForLatest($dir, &$latest) {
        $items = dir($dir);
        while (false !== ($entry = $items->read())) {
            if ($entry === '.' || $entry === '..') continue;
            $path = $dir . $entry;
            if (is_dir($path)) {
                $this->scanDirForLatest($path . '/', $latest);
            } elseif (preg_match('/\.txt$/', $entry)) {
                $mtime = filemtime($path);
                if ($mtime > $latest) $latest = $mtime;
            }
        }
        $items->close();
    }

    private function loadCacheMeta($file) {
        if (file_exists($file)) {
            return json_decode(file_get_contents($file), true) ?: [];
        }
        return [];
    }

    private function isLoggedIn() {
        return !empty($_SERVER['REMOTE_USER']);
    }

    private function getCurrentUser() {
        return $_SERVER['REMOTE_USER'] ?? null;
    }

    private function redirectToLogin() {
        global $ID;
        $loginUrl = wl('', ['do' => 'login', 'id' => $ID], true, '&');
        header("Location: $loginUrl");
    }
}