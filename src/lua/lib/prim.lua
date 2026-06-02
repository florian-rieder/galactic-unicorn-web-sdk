local Set = require("/lib/set.lua")

-- Prim's algorithm: find the minimum spanning tree of a graph;
-- i.e. the minimal graph that ensures all nodes are reachable by at least 1 edge
-- See https://en.wikipedia.org/wiki/Prim%27s_algorithm
local function Prim(vertices, edges)
  local cheapest_cost = {}
  local cheapest_edge = {}
  local explored = Set.new()
  local unexplored = Set.new(vertices)

  for _, vertex in ipairs(vertices) do
      cheapest_cost[vertex] = math.huge -- infinity
      cheapest_edge[vertex] = nil
  end

  -- Initialize a tree with a single vertex, chosen arbitrarily from the graph.
  local start_vertex = vertices[1] -- start at any element of vertices
  cheapest_cost[start_vertex] = 0 -- Forces starting with this vertex

  while not unexplored:is_empty() do
    -- Grow the tree by one edge:
    --   Of the edges that connect the tree to vertices not yet in the tree,
    --   find the minimum-weight edge, and transfer it to the tree.

    -- Find cheapest vertex to travel to
    local cheapest_vertex = nil
    local cheapest_vertex_cost = math.huge
    for vertex in pairs(unexplored) do
      if cheapest_cost[vertex] < cheapest_vertex_cost then
        cheapest_vertex = vertex
        cheapest_vertex_cost = cheapest_cost[vertex]
      end
    end

    local current_vertex = cheapest_vertex

    unexplored:remove(current_vertex)
    explored:add(current_vertex)

    for _, edge in ipairs(edges) do
      local neighbor = nil
      if edge.a == current_vertex then
        neighbor = edge.b
      elseif edge.b == current_vertex then
        neighbor = edge.a
      end

      if unexplored:contains(neighbor) and edge.weight < cheapest_cost[neighbor] then
        cheapest_cost[neighbor] = edge.weight
        cheapest_edge[neighbor] = edge
      end
    end
  end

  local result_edges = {}
  for _, vertex in ipairs(vertices) do
    if cheapest_edge[vertex] ~= nil then
      table.insert(result_edges, cheapest_edge[vertex])
    end
  end

  return result_edges
end

return Prim
