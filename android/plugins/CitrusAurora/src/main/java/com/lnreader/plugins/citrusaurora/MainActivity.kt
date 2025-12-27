package com.lnreader.plugins.citrusaurora

import android.app.Activity
import android.os.Bundle
import android.widget.Toast

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Toast.makeText(this, "Plugin Installed!", Toast.LENGTH_SHORT).show()
        finish()
    }
}
