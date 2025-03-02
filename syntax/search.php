<?php
if (!defined('DOKU_INC')) die();

class syntax_plugin_fuzzysearch_search extends DokuWiki_Syntax_Plugin {
    public function getType() { return 'substition'; }
    public function getSort() { return 150; }
    public function connectTo($mode) {
        $this->Lexer->addSpecialPattern('~~FUZZYSEARCH~~', $mode, 'plugin_fuzzysearch_search');
    }
    public function handle($match, $state, $pos, Doku_Handler $handler) {
        return ['type' => 'fuzzysearch'];
    }
    public function render($mode, Doku_Renderer $renderer, $data) {
        if ($mode !== 'xhtml') return false;
        if ($data['type'] === 'fuzzysearch') {
            $renderer->doc .= '<div id="fuzzysearch-container">';
            $renderer->doc .= '<input type="text" id="fuzzysearch-input" class="fuzzysearch-input" placeholder="Search pages..." />';
            $renderer->doc .= '<ul id="fuzzysearch-results" class="fuzzysearch-results"></ul>';
            $renderer->doc .= '</div>';
            static $assets_added = false;
            if (!$assets_added) {
                $renderer->doc .= '<script src="https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js"></script>';
                $assets_added = true;
            }
        }
        return true;
    }
}