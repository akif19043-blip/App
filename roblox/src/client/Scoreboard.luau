-- Skor tablosu (Tab tuşu ya da SKOR düğmesi). State.Scoreboard altındaki
-- satırları okur; botlar da listelenir.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)

local Ui = require(script.Parent.Ui)

local Scoreboard = {}

local C = Ui.Colors
local make, label, frame = Ui.make, Ui.label, Ui.frame

local gui
local columns = {}
local visible = false

local function header(parent)
	local row = frame({ Size = UDim2.new(1, 0, 0, 20), BackgroundTransparency = 1, LayoutOrder = 0, Parent = parent })
	local function cell(text, x, w, align)
		label({
			Position = UDim2.fromScale(x, 0),
			Size = UDim2.fromScale(w, 1),
			Text = text,
			TextSize = 11,
			TextColor3 = C.dim,
			TextXAlignment = align or Enum.TextXAlignment.Center,
			Parent = row,
		})
	end
	cell("OYUNCU", 0.04, 0.5, Enum.TextXAlignment.Left)
	cell("LEŞ", 0.52, 0.11)
	cell("ÖLÜM", 0.63, 0.11)
	cell("ASİST", 0.74, 0.11)
	cell("PUAN", 0.85, 0.13)
end

local function column(name, x, root)
	local panel = frame({
		Name = name,
		Position = UDim2.fromScale(x, 0),
		Size = UDim2.new(0.5, -6, 1, 0),
		BackgroundColor3 = C.ink,
		BackgroundTransparency = 0.15,
		Parent = root,
	}, { Ui.corner(8), Ui.pad(10) })
	local title = label({ Size = UDim2.new(1, 0, 0, 26), TextSize = 20, Font = Ui.FontBlack, Parent = panel })
	local list = frame({
		Position = UDim2.fromOffset(0, 32),
		Size = UDim2.new(1, 0, 1, -32),
		BackgroundTransparency = 1,
		Parent = panel,
	}, { Ui.list(Enum.FillDirection.Vertical, 3) })
	header(list)
	return { panel = panel, title = title, list = list, rows = {} }
end

function Scoreboard.build(playerGui, camera)
	gui = make("ScreenGui", {
		Name = "Scoreboard",
		IgnoreGuiInset = false,
		ResetOnSpawn = false,
		DisplayOrder = 8,
		Enabled = false,
		Parent = playerGui,
	})
	local canvas = Ui.canvas(gui, camera)
	local root = frame({
		Name = "Root",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(820, 440),
		BackgroundTransparency = 1,
		Parent = canvas,
	})
	columns[1] = column("A", 0, root)
	columns[2] = column("B", 0.5, root)
	return gui
end

local function rowFor(col, index)
	local row = col.rows[index]
	if row then
		return row
	end
	local f = frame({
		LayoutOrder = index,
		Size = UDim2.new(1, 0, 0, 26),
		BackgroundColor3 = C.panel2,
		BackgroundTransparency = 0.3,
		Parent = col.list,
	}, { Ui.corner(4) })
	local function cell(x, w, align)
		return label({
			Position = UDim2.fromScale(x, 0),
			Size = UDim2.fromScale(w, 1),
			TextSize = 14,
			TextXAlignment = align or Enum.TextXAlignment.Center,
			Parent = f,
		})
	end
	row = {
		frame = f,
		name = cell(0.04, 0.5, Enum.TextXAlignment.Left),
		kills = cell(0.52, 0.11),
		deaths = cell(0.63, 0.11),
		assists = cell(0.74, 0.11),
		score = cell(0.85, 0.13),
	}
	col.rows[index] = row
	return row
end

local function fill(col, entries, myUserId, color)
	for index, entry in ipairs(entries) do
		local row = rowFor(col, index)
		row.frame.Visible = true
		local mine = entry.userId ~= 0 and entry.userId == myUserId
		row.frame.BackgroundColor3 = mine and C.line or C.panel2
		row.name.Text = entry.name .. (entry.bot and "  ·  bot" or "") .. (entry.alive and "" or "  ✕")
		row.name.TextColor3 = color or C.text
		row.kills.Text = tostring(entry.kills)
		row.deaths.Text = tostring(entry.deaths)
		row.assists.Text = entry.ffa and ("S" .. entry.tier) or tostring(entry.assists)
		row.score.Text = tostring(entry.score)
	end
	for index = #entries + 1, #col.rows do
		col.rows[index].frame.Visible = false
	end
end

function Scoreboard.setVisible(value)
	visible = value
	if gui then
		gui.Enabled = value
	end
	if value then
		Scoreboard.refresh()
	end
end

function Scoreboard.isVisible()
	return visible
end

function Scoreboard.refresh()
	if not gui or not visible then
		return
	end
	local state = ReplicatedStorage:FindFirstChild("State")
	local board = state and state:FindFirstChild("Scoreboard")
	if not board then
		return
	end
	local ffa = state:GetAttribute("FFA") == true
	local entries = { Sahin = {}, Ejder = {}, all = {} }
	for _, row in ipairs(board:GetChildren()) do
		local entry = {
			name = row:GetAttribute("Name") or "?",
			team = row:GetAttribute("Team"),
			kills = row:GetAttribute("Kills") or 0,
			deaths = row:GetAttribute("Deaths") or 0,
			assists = row:GetAttribute("Assists") or 0,
			score = row:GetAttribute("Score") or 0,
			tier = row:GetAttribute("Tier") or 1,
			alive = row:GetAttribute("Alive") == true,
			bot = row:GetAttribute("Bot") == true,
			userId = row:GetAttribute("UserId") or 0,
			ffa = ffa,
		}
		table.insert(entries.all, entry)
		if entries[entry.team] then
			table.insert(entries[entry.team], entry)
		end
	end
	local function sorter(a, b)
		if ffa and a.tier ~= b.tier then
			return a.tier > b.tier
		end
		if a.score ~= b.score then
			return a.score > b.score
		end
		return a.kills > b.kills
	end
	local myUserId = Players.LocalPlayer.UserId
	if ffa then
		table.sort(entries.all, sorter)
		local half = math.ceil(#entries.all / 2)
		local first, second = {}, {}
		for index, entry in ipairs(entries.all) do
			table.insert(index <= half and first or second, entry)
		end
		columns[1].title.Text = "HERKES TEK · SIRALAMA"
		columns[1].title.TextColor3 = C.accent
		columns[2].title.Text = ""
		fill(columns[1], first, myUserId)
		fill(columns[2], second, myUserId)
	else
		for index, team in ipairs(Config.Teams) do
			table.sort(entries[team.id], sorter)
			local col = columns[index]
			local score = state:GetAttribute("Score" .. team.id) or 0
			col.title.Text = string.format("%s  ·  %d", string.upper(team.name), score)
			col.title.TextColor3 = team.color
			fill(col, entries[team.id], myUserId, nil)
		end
	end
end

return Scoreboard
