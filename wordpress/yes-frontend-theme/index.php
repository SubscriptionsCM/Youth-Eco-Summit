<?php
// Frontend requests are handled by template_redirect in functions.php.
if (!defined('ABSPATH')) { exit; }
get_header();
if (have_posts()) { while (have_posts()) { the_post(); the_content(); } }
get_footer();
