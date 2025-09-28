<?php
/**
 * Default settings for the fuzzysearch plugin
 *
 * @author Your Name
 */

$conf['restrict_to_acl'] = 1; // 1 to restrict to ACL-permitted pages, 0 to allow all
$conf['fuse_threshold']  = 0.4; // Fuzziness: lower is stricter matching
$conf['fuse_limit']      = 10; // Max search results to display