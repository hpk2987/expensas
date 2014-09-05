var paginationData = { 
	pageSize:5, 
	currPage:1,
	count:0,
	init:function(count){
		this.count = count;
		this.currPage = this.pages();
	},
	isLastPage: function(){
		return this.currentPage()==this.pages();
	},
	pages:function(){
		return Math.ceil(this.count/this.pageSize);
	},
	currentPage:function(){
		if(this.currPage>this.pages()){
			this.currPage = this.pages();
		}

		return this.currPage;
	},
	incCount:function(){
		this.count++;
		if(this.currPage==0){
			this.currPage=1;
		}
	},
	decCount:function(){
		this.count--;
	}
};

$(function() {
	$.get( "/getCuentas", function( data ) {
		data.forEach(function(entry){
			addCuentaDiv(entry);
		});
	});

	$("#addCuenta").ajaxForm({
		url: '/addCuenta', 
		dataType: 'json',
		resetForm: true,
		beforeSubmit:function(formData, jqForm, options){
			if(!formData[0].value){
				return false;
			}
			return true;
		},
		success: function(data,status,xhr,form) {
			addCuentaDiv(data);
    	}
	});
});

function addCuentaDiv(cuenta){
	$.get( "/countEntradas?idCuenta="+cuenta._id, function( data ) {
		
		//calculate cuentas div size
		var height = $("#")

		paginationData.init(data.count);

		var template = $("#cuenta_template").html();			
		var result = Mustache.render(template,cuenta);

		$("#cuentas").append(result);

		var tabtemplate = $("#tab_entry").html();			
		var tabresult = Mustache.render(tabtemplate,cuenta);
		$("#cuentas_tabs").append(tabresult);

		//Scrolling
		/*$("#cuenta_QSDiruvhdXZEfFiT > div:nth-child(1) > div:nth-child(2)")
		.paged_scroll({
	        handleScroll:function (page,container,doneCallback) {
	            alert("sccccc");
	        },
	        triggerFromBottom:'10px',
	        targetElement : $("#cuenta_entradas"+cuenta._id),
	        loader:'<div class="loader">Cargando ...</div>'
	    });*/

		actualizarTotal(cuenta._id);	
		addRowsFromPage(cuenta,1,paginationData.pageSize);

		$("#cuenta_delete"+cuenta._id).ajaxForm({
			url: '/removeCuenta',
			dataType: 'html',
			success: function(data,status,xhr,form){
				$("#cuenta_"+cuenta._id).remove();
			}
		});

		$("#cuenta_newEntry"+cuenta._id).ajaxForm({
			url: '/addEntrada',
			dataType: 'json',
			resetForm: true,
			beforeSubmit:function(formData, jqForm, options){
				if(!formData[1].value){
					return false;
				}
				if(isNaN(parseFloat(formData[2].value))){
					return false;
				}
				return true;
			},
			success: function(data,status,xhr,form){
				prependRowToTable(data);
			}
		});
	});
}

function addRowsFromPage(cuenta,page,pageSize){
	$.get( 	"/getEntradas?idCuenta="+cuenta._id+
					"&offset="+
					(page-1)*(pageSize)+
					"&size="+pageSize, function( data ) {
		cuenta.entradas=data;

		var template = $("#entradas_rows_template").html();			
			var result = Mustache.render(template,cuenta);
		$("#cuenta_entradas_"+cuenta._id+">tbody>tr:first")
			.after(result);

		cuenta.entradas.forEach(function(entrada){
			ajaxFormOnEntrada(entrada);
		});
	});

}

function prependRowToTable(entrada){
	paginationData.incCount();
	if(paginationData.isLastPage()){
		var template = $("#entrada_row_template").html();
	  	var result = Mustache.render(template,entrada);

		$("#cuenta_entradas_"+entrada.cuenta+">tbody>tr:first")
			.after(result);

		ajaxFormOnEntrada(entrada);

		actualizarTotal(entrada.cuenta);
	}
}

function ajaxFormOnEntrada(entrada){
	$("#entrada_delete"+entrada._id).ajaxForm({
		url: '/removeEntrada',
		dataType: 'json',
		resetForm: true,
		success: function(data,status,xhr,form){
			removeRowFromTable(entrada.cuenta,data.id);
			
			$("#cuenta_newEntry_"+entrada._id+">input[name='desc']")
				.focus();
		}
	});
}

function removeRowFromTable(cuentaId,entradaId){
	$("#entrada_row_"+entradaId).remove();

	actualizarTotal(cuentaId);

	paginationData.decCount();
	$('#pagination_'+cuentaId).bootpag({
		total: paginationData.pages()
	});
	showCurrentRowPage({ _id:cuentaId });
}

function actualizarTotal(cuentaId){
	$.get( "/getTotalCuenta?id="+cuentaId, function( data ) {
		$("#cuenta_total_"+cuentaId)
			.html(data.total);
	});
}