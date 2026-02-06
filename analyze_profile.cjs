const fs = require('fs');

const profilePath = process.argv[2];
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

// V8 CPU Profile structure
const nodes = profile.nodes;
const samples = profile.samples;
const timeDeltas = profile.timeDeltas;

const functionTimes = {};

if (samples && timeDeltas && samples.length === timeDeltas.length) {
    for (let i = 0; i < samples.length; i++) {
        const nodeId = samples[i];
        const duration = timeDeltas[i];
        const node = nodes.find(n => n.id === nodeId);
        
        if (node) {
            const name = node.callFrame.functionName || '(anonymous)';
            const url = node.callFrame.url || '';
            const key = `${name} (${url})`;
            
            functionTimes[key] = (functionTimes[key] || 0) + duration;
        }
    }
} else {
    // Fallback if samples/timeDeltas are not available (some formats use hitCount on nodes)
    console.log("Analyzing based on hitCounts/selfTime if available...");
    nodes.forEach(node => {
        const name = node.callFrame.functionName || '(anonymous)';
        const url = node.callFrame.url || '';
        const key = `${name} (${url})`;
        // Some profiles usually don't have explicit time on nodes without processing samples,
        // but let's check if there is a 'hitCount' and assume a fixed sample rate if deltas are missing.
        // But usually samples+deltas are present.
        if (node.hitCount) {
             functionTimes[key] = (functionTimes[key] || 0) + node.hitCount;
        }
    });
}

// Convert to array and sort
const sorted = Object.entries(functionTimes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20); // Show top 20

console.log("Top 20 functions by self-time (microseconds):");
sorted.forEach(([name, time]) => {
    console.log(`${time.toString().padStart(10)}: ${name}`);
});

console.log("\nAnalyzing parents of top functions...");

// Map node IDs to nodes for easy lookup
const nodeMap = new Map();
nodes.forEach(n => nodeMap.set(n.id, n));

// Build a parent map (child ID -> parent ID) based on the profile structure
// CPU profiles are trees. 'nodes' usually contain 'children' IDs.
const parentMap = new Map();
nodes.forEach(node => {
    if (node.children) {
        node.children.forEach(childId => {
            parentMap.set(childId, node.id);
        });
    }
});

sorted.forEach(([targetName]) => {
    console.log(`\nCallers for ${targetName}:`);
    const callers = {};
    
    // Scan all nodes to find those matching the target name
    nodes.forEach(node => {
        const name = node.callFrame.functionName || '(anonymous)';
        const url = node.callFrame.url || '';
        const key = `${name} (${url})`;
        
        if (key === targetName) {
            // Find parent
            const parentId = parentMap.get(node.id);
            if (parentId) {
                const parent = nodeMap.get(parentId);
                if (parent) {
                    const pName = parent.callFrame.functionName || '(anonymous)';
                    const pUrl = parent.callFrame.url || '';
                    const pKey = `${pName} (${pUrl})`;
                    
                    // We need to attribute time to this caller. 
                    // In a flat sample list, we can count how many times this node appeared in samples.
                    // But here we are aggregating by function name.
                    // Let's just count occurrences of this parent->child relationship in the tree structure
                    // weighted by the child's hit count/time? 
                    // To be precise requires traversing the sample stack.
                    // For now, let's just list the parents found in the tree.
                    callers[pKey] = (callers[pKey] || 0) + 1;
                }
            }
        }
    });

    Object.keys(callers).forEach(caller => {
        console.log(`  - ${caller}`);
    });
});
