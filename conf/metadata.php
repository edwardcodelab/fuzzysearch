<?php
/**
 * Metadata for fuzzysearch plugin configuration
 */

$meta['restrict_to_acl'] = array('onoff');
$meta['fuse_threshold']  = array('numeric', '_min' => 0, '_max' => 1);
$meta['fuse_limit']      = array('numeric', '_min' => 1);